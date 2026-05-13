import { tx } from "@stacks/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const contract = "stx-staking";
const accounts = simnet.getAccounts();
const owner = simnet.deployer;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const contractPrincipal = `${simnet.deployer}.${contract}`;

beforeEach(() => {
  simnet.setEpoch("3.0");
});

describe("STX Yield Vault", () => {
  it("exposes read-only defaults", () => {
    const { result: userDeposit } = simnet.callReadOnlyFn(
      contract,
      "get-user-deposit",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(userDeposit).toBeOk(Cl.uint(0));

    const { result: totalDeposited } = simnet.callReadOnlyFn(
      contract,
      "get-total-deposited",
      [],
      wallet1,
    );
    expect(totalDeposited).toBeOk(Cl.uint(0));

    const { result: rewards } = simnet.callReadOnlyFn(
      contract,
      "get-user-rewards",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(rewards).toBeOk(Cl.uint(0));

    const { result: ownerResult } = simnet.callReadOnlyFn(
      contract,
      "get-owner",
      [],
      wallet1,
    );
    expect(ownerResult).toBeOk(Cl.principal(owner));

    const { result: paused } = simnet.callReadOnlyFn(
      contract,
      "get-paused",
      [],
      wallet1,
    );
    expect(paused).toBeOk(Cl.bool(false));

    const { result: pending } = simnet.callReadOnlyFn(
      contract,
      "get-pending-withdrawal",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(pending).toBeOk(Cl.bool(false));
  });

  it("rejects invalid deposit inputs", () => {
    const block = simnet.mineBlock([
      tx.callPublicFn(contract, "deposit", [Cl.uint(0)], wallet1),
    ]);

    expect(block[0].result).toBeErr(Cl.uint(101));
  });

  it("records deposits", () => {
    const deposit = simnet.mineBlock([
      tx.callPublicFn(contract, "deposit", [Cl.uint(1000)], wallet1),
    ]);

    expect(deposit[0].result).toBeOk(Cl.bool(true));

    const { result: userDeposit } = simnet.callReadOnlyFn(
      contract,
      "get-user-deposit",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(userDeposit).toBeOk(Cl.uint(1000));

    const { result: totalDeposited } = simnet.callReadOnlyFn(
      contract,
      "get-total-deposited",
      [],
      wallet1,
    );
    expect(totalDeposited).toBeOk(Cl.uint(1000));
  });

  it("accumulates multiple deposits and updates totals", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "deposit", [Cl.uint(400)], wallet1),
      tx.callPublicFn(contract, "deposit", [Cl.uint(600)], wallet1),
      tx.callPublicFn(contract, "deposit", [Cl.uint(1000)], wallet2),
    ]);

    const { result: userDeposit1 } = simnet.callReadOnlyFn(
      contract,
      "get-user-deposit",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(userDeposit1).toBeOk(Cl.uint(1000));

    const { result: userDeposit2 } = simnet.callReadOnlyFn(
      contract,
      "get-user-deposit",
      [Cl.principal(wallet2)],
      wallet2,
    );
    expect(userDeposit2).toBeOk(Cl.uint(1000));

    const { result: totalDeposited } = simnet.callReadOnlyFn(
      contract,
      "get-total-deposited",
      [],
      wallet1,
    );
    expect(totalDeposited).toBeOk(Cl.uint(2000));
  });

  it("rejects request-withdraw when no deposit exists", () => {
    const request = simnet.mineBlock([
      tx.callPublicFn(contract, "request-withdraw", [], wallet2),
    ]);
    expect(request[0].result).toBeErr(Cl.uint(103));
  });

  it("allows request-withdraw and process-withdraw", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "deposit", [Cl.uint(1000)], wallet1),
    ]);

    const request = simnet.mineBlock([
      tx.callPublicFn(contract, "request-withdraw", [], wallet1),
    ]);
    expect(request[0].result).toBeOk(Cl.bool(true));

    const { result: pending } = simnet.callReadOnlyFn(
      contract,
      "get-pending-withdrawal",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(pending).toBeOk(Cl.bool(true));

    const process = simnet.mineBlock([
      tx.callPublicFn(contract, "process-withdraw", [Cl.principal(wallet1)], owner),
    ]);

    expect(process[0].result).toBeOk(
      Cl.tuple({
        withdrawn: Cl.uint(1000),
        principal: Cl.uint(1000),
        rewards: Cl.uint(0),
      }),
    );

    const { result: totalDeposited } = simnet.callReadOnlyFn(
      contract,
      "get-total-deposited",
      [],
      wallet1,
    );
    expect(totalDeposited).toBeOk(Cl.uint(0));

    const { result: userDeposit } = simnet.callReadOnlyFn(
      contract,
      "get-user-deposit",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(userDeposit).toBeOk(Cl.uint(0));

    const { result: pendingAfter } = simnet.callReadOnlyFn(
      contract,
      "get-pending-withdrawal",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(pendingAfter).toBeOk(Cl.bool(false));
  });

  it("rejects duplicate request-withdraw", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "deposit", [Cl.uint(1000)], wallet1),
      tx.callPublicFn(contract, "request-withdraw", [], wallet1),
    ]);

    const secondRequest = simnet.mineBlock([
      tx.callPublicFn(contract, "request-withdraw", [], wallet1),
    ]);
    expect(secondRequest[0].result).toBeErr(Cl.uint(101)); // reusing ERR_INVALID_AMOUNT
  });

  it("rejects process-withdraw if no request", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "deposit", [Cl.uint(1000)], wallet1),
    ]);

    const process = simnet.mineBlock([
      tx.callPublicFn(contract, "process-withdraw", [Cl.principal(wallet1)], owner),
    ]);
    expect(process[0].result).toBeErr(Cl.uint(106)); // ERR_NO_REQUEST
  });

  it("distributes rewards proportionally", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "deposit", [Cl.uint(1000)], wallet1),
      tx.callPublicFn(contract, "deposit", [Cl.uint(1000)], wallet2),
    ]);

    simnet.mineBlock([
      tx.callPublicFn(contract, "add-rewards", [Cl.uint(200)], owner),
    ]);

    const request1 = simnet.mineBlock([
      tx.callPublicFn(contract, "request-withdraw", [], wallet1),
    ]);
    expect(request1[0].result).toBeOk(Cl.bool(true));

    const process1 = simnet.mineBlock([
      tx.callPublicFn(contract, "process-withdraw", [Cl.principal(wallet1)], owner),
    ]);

    expect(process1[0].result).toBeOk(
      Cl.tuple({
        withdrawn: Cl.uint(1100),
        principal: Cl.uint(1000),
        rewards: Cl.uint(100),
      }),
    );

    const request2 = simnet.mineBlock([
      tx.callPublicFn(contract, "request-withdraw", [], wallet2),
    ]);
    expect(request2[0].result).toBeOk(Cl.bool(true));

    const process2 = simnet.mineBlock([
      tx.callPublicFn(contract, "process-withdraw", [Cl.principal(wallet2)], owner),
    ]);

    expect(process2[0].result).toBeOk(
      Cl.tuple({
        withdrawn: Cl.uint(1100),
        principal: Cl.uint(1000),
        rewards: Cl.uint(100),
      }),
    );
  });

  it("pauses and unpauses deposits and requests", () => {
    const pause = simnet.mineBlock([
      tx.callPublicFn(contract, "pause", [], owner),
    ]);
    expect(pause[0].result).toBeOk(Cl.bool(true));

    const pausedDeposit = simnet.mineBlock([
      tx.callPublicFn(contract, "deposit", [Cl.uint(100)], wallet1),
    ]);
    expect(pausedDeposit[0].result).toBeErr(Cl.uint(104)); // ERR_PAUSED

    const pausedRequest = simnet.mineBlock([
      tx.callPublicFn(contract, "request-withdraw", [], wallet1),
    ]);
    expect(pausedRequest[0].result).toBeErr(Cl.uint(104));

    const unpause = simnet.mineBlock([
      tx.callPublicFn(contract, "unpause", [], owner),
    ]);
    expect(unpause[0].result).toBeOk(Cl.bool(true));
  });

  it("restricts owner-only functions", () => {
    const addRewardsFail = simnet.mineBlock([
      tx.callPublicFn(contract, "add-rewards", [Cl.uint(100)], wallet1),
    ]);
    expect(addRewardsFail[0].result).toBeErr(Cl.uint(102));

    const addRewardsInvalid = simnet.mineBlock([
      tx.callPublicFn(contract, "add-rewards", [Cl.uint(0)], owner),
    ]);
    expect(addRewardsInvalid[0].result).toBeErr(Cl.uint(101));

    const addRewardsOk = simnet.mineBlock([
      tx.callPublicFn(contract, "add-rewards", [Cl.uint(100)], owner),
    ]);
    expect(addRewardsOk[0].result).toBeOk(Cl.bool(true));

    const assetsAfterRewards = simnet.getAssetsMap();
    const contractBalance = assetsAfterRewards.get("STX")?.get(contractPrincipal) ?? 0n;
    expect(contractBalance).toBeGreaterThan(0n);

    const drainFail = simnet.mineBlock([
      tx.callPublicFn(contract, "emergency-drain", [], wallet2),
    ]);
    expect(drainFail[0].result).toBeErr(Cl.uint(102));

    const pauseFail = simnet.mineBlock([
      tx.callPublicFn(contract, "pause", [], wallet2),
    ]);
    expect(pauseFail[0].result).toBeErr(Cl.uint(102));

    const setOwnerFail = simnet.mineBlock([
      tx.callPublicFn(contract, "set-owner", [Cl.principal(wallet2)], wallet2),
    ]);
    expect(setOwnerFail[0].result).toBeErr(Cl.uint(102));

    const drainOk = simnet.mineBlock([
      tx.callPublicFn(contract, "emergency-drain", [], owner),
    ]);
    expect(drainOk[0].result).toBeOk(Cl.uint(contractBalance));

    const assetsAfterDrain = simnet.getAssetsMap();
    const drainedBalance = assetsAfterDrain.get("STX")?.get(contractPrincipal) ?? 0n;
    expect(drainedBalance).toBe(0n);
  });

  it("allows owner to add rewards", () => {
    const before = simnet.getAssetsMap().get("STX")?.get(contractPrincipal) ?? 0n;

    const block = simnet.mineBlock([
      tx.callPublicFn(contract, "add-rewards", [Cl.uint(250)], owner),
    ]);
    expect(block[0].result).toBeOk(Cl.bool(true));

    const after = simnet.getAssetsMap().get("STX")?.get(contractPrincipal) ?? 0n;
    expect(after).toBe(before + 250n);
  });

  it("allows owner to emergency drain", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "add-rewards", [Cl.uint(300)], owner),
    ]);

    const balanceBefore = simnet.getAssetsMap().get("STX")?.get(contractPrincipal) ?? 0n;
    expect(balanceBefore).toBeGreaterThan(0n);

    const drain = simnet.mineBlock([
      tx.callPublicFn(contract, "emergency-drain", [], owner),
    ]);
    expect(drain[0].result).toBeOk(Cl.uint(balanceBefore));

    const balanceAfter = simnet.getAssetsMap().get("STX")?.get(contractPrincipal) ?? 0n;
    expect(balanceAfter).toBe(0n);
  });

  it("allows owner rotation", () => {
    const setOwner = simnet.mineBlock([
      tx.callPublicFn(contract, "set-owner", [Cl.principal(wallet2)], owner),
    ]);
    expect(setOwner[0].result).toBeOk(Cl.bool(true));

    const oldOwnerPause = simnet.mineBlock([
      tx.callPublicFn(contract, "pause", [], owner),
    ]);
    expect(oldOwnerPause[0].result).toBeErr(Cl.uint(102));

    const pause = simnet.mineBlock([
      tx.callPublicFn(contract, "pause", [], wallet2),
    ]);
    expect(pause[0].result).toBeOk(Cl.bool(true));
  });

  it("rejects invalid owner updates", () => {
    const sameOwner = simnet.mineBlock([
      tx.callPublicFn(contract, "set-owner", [Cl.principal(owner)], owner),
    ]);
    expect(sameOwner[0].result).toBeErr(Cl.uint(105)); // ERR_INVALID_OWNER

    const contractAsOwner = simnet.mineBlock([
      tx.callPublicFn(contract, "set-owner", [Cl.principal(contractPrincipal)], owner),
    ]);
    expect(contractAsOwner[0].result).toBeErr(Cl.uint(105));
  });
});