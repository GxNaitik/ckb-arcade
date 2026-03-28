/**
 * CKB Arcade — Agent Lock Policy Tests
 *
 * Tests the off-chain LockScriptPolicy that mirrors the on-chain
 * agent_lock.c rules. Validates:
 *   1. Destination whitelist enforcement
 *   2. Per-TX spend cap
 *   3. Change-return safety check
 *   4. Args builder output format
 */

import {
    createAgentLockPolicy,
    buildAgentLockArgs,
} from "../contracts/agent-lock-policy.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}`);
        failed++;
    }
}

// ── Tests ────────────────────────────────────────────────────────

async function testWhitelistBlocks() {
    console.log("\n🔸 Test: Blocks non-whitelisted addresses");

    const policy = createAgentLockPolicy({
        allowedGameAddresses: ["ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqgpkhatzmtfs"],
        maxSpendPerTx: 500,
    });

    const result = await policy.validate({
        toAddress: "ckt1qUnknownAddressThatIsNotWhitelisted",
        amountCkb: 100,
        walletBalance: 1000,
        agentId: "test",
    });

    assert(!result.allowed, "Non-whitelisted address is blocked");
    assert(result.reason!.includes("not whitelisted"), "Reason mentions whitelist");
}

async function testWhitelistAllows() {
    console.log("\n🔸 Test: Allows whitelisted addresses");

    const gameAddr = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqgpkhatzmtfs";

    const policy = createAgentLockPolicy({
        allowedGameAddresses: [gameAddr],
        maxSpendPerTx: 500,
    });

    const result = await policy.validate({
        toAddress: gameAddr,
        amountCkb: 100,
        walletBalance: 1000,
        agentId: "test",
    });

    assert(result.allowed, "Whitelisted address is allowed");
}

async function testMultipleWhitelistAddresses() {
    console.log("\n🔸 Test: Multiple whitelisted addresses");

    const addr1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqgpkhatzmtfs";
    const addr2 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqsomeother";

    const policy = createAgentLockPolicy({
        allowedGameAddresses: [addr1, addr2],
        maxSpendPerTx: 500,
    });

    const r1 = await policy.validate({
        toAddress: addr1, amountCkb: 100, walletBalance: 1000, agentId: "test",
    });
    const r2 = await policy.validate({
        toAddress: addr2, amountCkb: 100, walletBalance: 1000, agentId: "test",
    });

    assert(r1.allowed, "First address allowed");
    assert(r2.allowed, "Second address allowed");
}

async function testMaxSpendBlocks() {
    console.log("\n🔸 Test: Blocks spend above per-TX cap");

    const gameAddr = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqgpkhatzmtfs";

    const policy = createAgentLockPolicy({
        allowedGameAddresses: [gameAddr],
        maxSpendPerTx: 200,
    });

    const result = await policy.validate({
        toAddress: gameAddr,
        amountCkb: 300,
        walletBalance: 1000,
        agentId: "test",
    });

    assert(!result.allowed, "300 CKB blocked (cap: 200)");
    assert(result.reason!.includes("max-spend-per-TX"), "Reason mentions spend cap");
}

async function testMaxSpendAllows() {
    console.log("\n🔸 Test: Allows spend at or below cap");

    const gameAddr = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqgpkhatzmtfs";

    const policy = createAgentLockPolicy({
        allowedGameAddresses: [gameAddr],
        maxSpendPerTx: 200,
    });

    const exact = await policy.validate({
        toAddress: gameAddr, amountCkb: 200, walletBalance: 1000, agentId: "test",
    });
    const under = await policy.validate({
        toAddress: gameAddr, amountCkb: 100, walletBalance: 1000, agentId: "test",
    });

    assert(exact.allowed, "Exact cap amount allowed");
    assert(under.allowed, "Under cap amount allowed");
}

async function testChangeReturnSafety() {
    console.log("\n🔸 Test: Blocks TX that leaves unspendable change");

    const gameAddr = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqgpkhatzmtfs";

    const policy = createAgentLockPolicy({
        allowedGameAddresses: [gameAddr],
        maxSpendPerTx: 500,
        agentAddress: "ckt1qAgent...",
    });

    // Balance 100, spend 50 → remaining 50 < 61 minimum cell
    const result = await policy.validate({
        toAddress: gameAddr,
        amountCkb: 50,
        walletBalance: 100,
        agentId: "test",
    });

    assert(!result.allowed, "Blocked: 50 CKB remaining < 61 CKB minimum cell");
    assert(result.reason!.includes("minimum cell capacity"), "Reason mentions cell capacity");
}

async function testChangeReturnAllows() {
    console.log("\n🔸 Test: Allows TX with sufficient change");

    const gameAddr = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqgpkhatzmtfs";

    const policy = createAgentLockPolicy({
        allowedGameAddresses: [gameAddr],
        maxSpendPerTx: 500,
        agentAddress: "ckt1qAgent...",
    });

    // Balance 200, spend 100 → remaining 100 > 61 ✓
    const result = await policy.validate({
        toAddress: gameAddr,
        amountCkb: 100,
        walletBalance: 200,
        agentId: "test",
    });

    assert(result.allowed, "Allowed: 100 CKB remaining > 61 minimum");
}

async function testEmptyToAddressPassesWhitelist() {
    console.log("\n🔸 Test: Empty toAddress bypasses whitelist (canSpend check)");

    const policy = createAgentLockPolicy({
        allowedGameAddresses: ["ckt1qValid..."],
        maxSpendPerTx: 500,
    });

    const result = await policy.validate({
        toAddress: "",
        amountCkb: 100,
        walletBalance: 1000,
        agentId: "test",
    });

    assert(result.allowed, "Empty address passes (used by canSpend pre-checks)");
}

async function testArgsBuilder() {
    console.log("\n🔸 Test: buildAgentLockArgs output format");

    const args = buildAgentLockArgs({
        ownerPubkeyHash: "0x" + "aa".repeat(20),
        gameLockHash: "0x" + "bb".repeat(32),
        maxSpendCkb: 500,
    });

    assert(args.startsWith("0x"), "Args start with 0x");

    // Total: 2 (0x) + 40 (owner) + 64 (game) + 16 (spend) + 50 (reserved) = 172 chars
    assert(
        args.length === 2 + 170,
        `Args length is 172 hex chars (got ${args.length})`,
    );

    // Verify owner pubkey hash is at the start
    assert(args.slice(2, 42) === "aa".repeat(20), "Owner pubkey hash correct");

    // Verify game lock hash follows
    assert(args.slice(42, 106) === "bb".repeat(32), "Game lock hash correct");
}

async function testArgsSpendEncoding() {
    console.log("\n🔸 Test: Args spend amount LE encoding");

    const args = buildAgentLockArgs({
        ownerPubkeyHash: "0x" + "00".repeat(20),
        gameLockHash: "0x" + "00".repeat(32),
        maxSpendCkb: 1, // 1 CKB = 100_000_000 shannons = 0x05F5E100
    });

    // 100_000_000 in LE = 00 e1 f5 05 00 00 00 00
    const spendHex = args.slice(106, 122); // bytes [52..59]
    assert(
        spendHex === "00e1f50500000000",
        `1 CKB = 100M shannons LE (got ${spendHex})`,
    );
}

// ── Runner ───────────────────────────────────────────────────────

async function main() {
    console.log("═══════════════════════════════════════════");
    console.log("  CKB Arcade — Agent Lock Policy Tests");
    console.log("═══════════════════════════════════════════");

    await testWhitelistBlocks();
    await testWhitelistAllows();
    await testMultipleWhitelistAddresses();
    await testMaxSpendBlocks();
    await testMaxSpendAllows();
    await testChangeReturnSafety();
    await testChangeReturnAllows();
    await testEmptyToAddressPassesWhitelist();
    await testArgsBuilder();
    await testArgsSpendEncoding();

    console.log("\n───────────────────────────────────────────");
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log("───────────────────────────────────────────\n");

    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error("Test suite crashed:", err);
    process.exit(1);
});
