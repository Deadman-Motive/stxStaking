# stxStaking

## Overview

`stxStaking` is a simple STX yield vault built in Clarity for the Stacks blockchain. It allows users to deposit STX, earn proportional rewards added by the contract owner, request withdrawals, and have withdrawals processed by the owner.

The contract maintains user deposits, reward accounting, and pending withdrawal requests while protecting owner-only actions with access control and a pause mechanism.

## Key Features

- Deposit STX into the vault
- Track individual user deposits and total vault deposits
- Owner-funded reward distribution using proportional allocation
- Request-based withdrawal flow for user balances + accrued rewards
- Pause / unpause contract operations for emergency control
- Owner-only functions for rewards adding, processing withdrawals, emergency drain, and ownership transfers

## Contract Behavior

### Deposit Flow

- Users call `deposit(amount)` with an STX amount greater than zero.
- Deposits are recorded in the `deposits` map and `total-deposited` is updated.
- If rewards were previously added when no depositors existed, unallocated rewards are held and distributed when the first deposit arrives.

### Reward Distribution

- The owner calls `add-rewards(amount)` to fund the vault with STX rewards.
- Rewards are distributed immediately across existing depositors using a precision-scaled reward-per-token mechanism.
- If there are no deposits at distribution time, rewards are stored as `unallocated-rewards` until the next deposit.

### Withdrawal Flow

- Depositors call `request-withdraw()` to queue a withdrawal request.
- The owner processes the withdrawal by calling `process-withdraw(user)`.
- The user receives the original deposit plus any accrued rewards.
- After processing, deposits, reward debt, accrued rewards, and the pending request flag are reset.

### Emergency & Governance

- `pause()` and `unpause()` let the owner temporarily disable deposits and withdrawal requests.
- `emergency-drain()` withdraws the contract's full STX balance back to the owner.
- `set-owner(new-owner)` transfers ownership to a new principal.

## Contract API

### Public Functions

- `deposit(amount uint) -> (response bool uint)`
- `request-withdraw() -> (response bool uint)`
- `add-rewards(amount uint) -> (response bool uint)`
- `process-withdraw(user principal) -> (response (tuple (withdrawn uint) (principal uint) (rewards uint)) bool)`
- `emergency-drain() -> (response uint bool)`
- `set-owner(new-owner principal) -> (response bool uint)`
- `pause() -> (response bool uint)`
- `unpause() -> (response bool uint)`

### Read-Only Functions

- `get-user-deposit(user principal) -> uint`
- `get-total-deposited() -> uint`
- `get-user-rewards(user principal) -> uint`
- `get-owner() -> principal`
- `get-paused() -> bool`
- `get-pending-withdrawal(user principal) -> bool`

## Error Codes

- `101` - Invalid amount or duplicate withdraw request
- `102` - Caller is not contract owner
- `103` - User has no deposit
- `104` - Contract is paused
- `105` - Invalid owner update
- `106` - No withdrawal request found

## Storage Layout

- `deposits`: map principal -> uint
- `reward-debt`: map principal -> uint
- `accrued-rewards`: map principal -> uint
- `pending-withdrawals`: map principal -> bool
- `total-deposited`: uint
- `total-rewards`: uint
- `reward-per-token`: uint
- `unallocated-rewards`: uint
- `paused`: bool
- `vault-owner`: principal

## Development & Testing

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Additional Test Command

```bash
npm run test:report
```

This project uses `vitest` with `vitest-environment-clarinet` to execute contract tests against a local Stacks simulator.

## File Structure

- `contracts/stxStaking.clar` – main Clarity smart contract implementation
- `tests/stxStaking.test.ts` – automated functional tests for deposits, rewards, withdrawals, and owner controls
- `package.json` – Node.js test harness and dependency definitions

## Notes

- The contract owner is set to the deployer by default.
- Rewards are distributed proportionally to each depositor's share of total deposits.
- Withdrawals require a request step followed by owner processing to complete.

## License

This repository is currently configured as a private test harness. Update the license section if you publish or share this project.
