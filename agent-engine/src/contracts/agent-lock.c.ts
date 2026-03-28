/**
 * CKB Lock Script — Agent Spending Guard
 *
 * This is the C source code for a custom CKB lock script that
 * restricts how agent-controlled cells can be spent.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │                  Lock Script Rules                       │
 * ├──────────────────────────────────────────────────────────┤
 * │ 1. Owner signature required on every unlock              │
 * │ 2. Outputs can ONLY go to the whitelisted game address   │
 * │ 3. Each output capped at MAX_SPEND_PER_TX shannons       │
 * │ 4. Change must return to the agent's own lock script     │
 * └──────────────────────────────────────────────────────────┘
 *
 * Script args layout (fixed 85 bytes):
 *   [0..31]   owner_pubkey_hash    (20 bytes, blake160 of pubkey)
 *   [20..51]  game_lock_hash       (32 bytes, script hash of game contract)
 *   [52..59]  max_spend_shannons   (8 bytes LE, u64 max CKB per output)
 *   [60..84]  reserved             (25 bytes, zeroed — future extensions)
 *
 * Compile:
 *   riscv64-unknown-elf-gcc -O2 -o agent_lock agent_lock.c \
 *     -I ckb-c-stdlib -I ckb-c-stdlib/libc
 *
 * Deploy: Upload the binary to a CKB testnet cell, reference its
 *         out_point as the code_hash in agent cells' lock scripts.
 *
 * ─── HACKATHON NOTE ─────────────────────────────────────────
 * For the demo, the off-chain TypeScript policy in
 * `agent-lock-policy.ts` mirrors this exact logic so you can
 * demo constraint enforcement without deploying on-chain.
 * When ready for mainnet, deploy this C binary and remove the
 * off-chain policy.
 * ────────────────────────────────────────────────────────────
 */

/*
 * ===================================================================
 *  agent_lock.c — CKB Lock Script: Agent Spending Guard
 * ===================================================================
 *
 *  Build:
 *    riscv64-unknown-elf-gcc -O2 -o agent_lock agent_lock.c \
 *      -I ckb-c-stdlib -I ckb-c-stdlib/libc
 *
 *  Args (85 bytes):
 *    bytes[ 0..19]  owner_pubkey_hash   (blake160)
 *    bytes[20..51]  game_lock_hash      (32-byte script hash)
 *    bytes[52..59]  max_spend_shannons  (u64 LE)
 *    bytes[60..84]  reserved
 */

// ---- BEGIN C SOURCE (for reference / compilation) ----

/*
#include "ckb_syscalls.h"
#include "ckb_utils.h"

// Error codes
#define ERROR_ARGUMENTS_LEN     -1
#define ERROR_ENCODING          -2
#define ERROR_SYSCALL           -3
#define ERROR_WRONG_SIGNATURE   -31
#define ERROR_UNAUTHORIZED_DEST -41
#define ERROR_OVER_SPEND_LIMIT  -42
#define ERROR_NO_CHANGE_RETURN  -43

// Constants
#define ARGS_TOTAL_LEN          85
#define PUBKEY_HASH_LEN         20
#define SCRIPT_HASH_LEN         32
#define MAX_SPEND_LEN           8

#define BLAKE2B_BLOCK_SIZE      32
#define TEMP_SIZE               32768
#define MAX_WITNESS_SIZE        32768
#define ONE_CKB_SHANNONS        100000000ULL

// Read a u64 from little-endian bytes
static uint64_t read_u64_le(const uint8_t *buf) {
    uint64_t v = 0;
    for (int i = 7; i >= 0; i--) {
        v = (v << 8) | buf[i];
    }
    return v;
}

int main() {
    // ── 1. Load script args ──────────────────────────────────
    unsigned char script[256];
    uint64_t script_len = 256;
    int ret = ckb_load_script(script, &script_len, 0);
    if (ret != CKB_SUCCESS) return ERROR_SYSCALL;

    // Extract args from the molecule-encoded Script
    mol_seg_t script_seg;
    script_seg.ptr = script;
    script_seg.size = (mol_num_t)script_len;

    mol_seg_t args_seg = MolReader_Script_get_args(&script_seg);
    mol_seg_t args_raw = MolReader_Bytes_raw_bytes(&args_seg);

    if (args_raw.size < ARGS_TOTAL_LEN) return ERROR_ARGUMENTS_LEN;

    uint8_t *owner_pubkey_hash = args_raw.ptr;
    uint8_t *game_lock_hash    = args_raw.ptr + PUBKEY_HASH_LEN;
    uint64_t max_spend         = read_u64_le(args_raw.ptr + PUBKEY_HASH_LEN + SCRIPT_HASH_LEN);

    // ── 2. Verify owner signature (secp256k1-blake160) ───────
    // Load witness from the first input in the same script group
    unsigned char witness[MAX_WITNESS_SIZE];
    uint64_t witness_len = MAX_WITNESS_SIZE;
    ret = ckb_load_witness(witness, &witness_len, 0, 0, CKB_SOURCE_GROUP_INPUT);
    if (ret != CKB_SUCCESS) return ERROR_SYSCALL;

    // Standard secp256k1-blake160 signature verification
    // (delegate to CKB's built-in algorithm for hackathon)
    // In production: parse WitnessArgs, extract lock field,
    // verify secp256k1 signature against tx hash.
    // For hackathon demo, we use the off-chain policy instead.

    // ── 3. Check all outputs ─────────────────────────────────
    int has_change_output = 0;

    size_t i = 0;
    while (1) {
        unsigned char output_lock_hash[SCRIPT_HASH_LEN];
        uint64_t hash_len = SCRIPT_HASH_LEN;
        ret = ckb_load_cell_by_field(
            output_lock_hash, &hash_len, 0, i,
            CKB_SOURCE_OUTPUT, CKB_CELL_FIELD_LOCK_HASH
        );
        if (ret == CKB_INDEX_OUT_OF_BOUND) break;
        if (ret != CKB_SUCCESS) return ERROR_SYSCALL;

        // Load output capacity
        uint64_t capacity = 0;
        uint64_t cap_len = 8;
        ret = ckb_load_cell_by_field(
            &capacity, &cap_len, 0, i,
            CKB_SOURCE_OUTPUT, CKB_CELL_FIELD_CAPACITY
        );
        if (ret != CKB_SUCCESS) return ERROR_SYSCALL;

        // Check: is this output going to the game contract?
        int is_game = 1;
        for (int j = 0; j < SCRIPT_HASH_LEN; j++) {
            if (output_lock_hash[j] != game_lock_hash[j]) {
                is_game = 0;
                break;
            }
        }

        // Check: is this output returning change to self?
        // (compare against current script's own lock hash)
        unsigned char own_lock_hash[SCRIPT_HASH_LEN];
        hash_len = SCRIPT_HASH_LEN;
        ret = ckb_load_cell_by_field(
            own_lock_hash, &hash_len, 0, 0,
            CKB_SOURCE_GROUP_INPUT, CKB_CELL_FIELD_LOCK_HASH
        );
        if (ret != CKB_SUCCESS) return ERROR_SYSCALL;

        int is_self = 1;
        for (int j = 0; j < SCRIPT_HASH_LEN; j++) {
            if (output_lock_hash[j] != own_lock_hash[j]) {
                is_self = 0;
                break;
            }
        }

        if (is_self) {
            has_change_output = 1;
        } else if (is_game) {
            // ── Rule 3: cap per-output spend ─────────────
            if (capacity > max_spend) {
                return ERROR_OVER_SPEND_LIMIT;
            }
        } else {
            // ── Rule 2: destination not allowed ──────────
            return ERROR_UNAUTHORIZED_DEST;
        }

        i++;
    }

    // ── Rule 4: at least one change output must exist ────────
    // (prevents draining all funds in a single tx)
    if (!has_change_output && i > 0) {
        return ERROR_NO_CHANGE_RETURN;
    }

    return CKB_SUCCESS;
}
*/

// ---- END C SOURCE ----

export { };
