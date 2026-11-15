# Archived contract sources

These contracts are not part of a new deployment and are kept out of the
Hardhat source tree (`src/contracts/`) so they are not compiled. They remain
here for anyone reading the history or the dated audits that mention them.

| File | Replaced by | Note |
|---|---|---|
| `BountyManagerV4.sol` | `BountyManagerV5.sol` | The reference deployment's treasuries hold zero allowance to the V4 instance (checked on-chain 2026-11-11). |
| `PodGovernance.sol` | `PodGovernanceV3.sol` | |
| `PodSELFDistributor.sol` | `SelfEpochsV2.sol` and the SELF role stipend flow | |

Do not deploy these. Reports against them are out of scope unless the issue
also exists in the replacement.
