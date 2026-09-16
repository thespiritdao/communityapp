// test/PodEligibilityModule.test.cjs
//   npx hardhat test test/PodEligibilityModule.test.cjs
//
// The module composes three rules; each test pins one boundary of them.

// The hardhat config does not load the toolbox, so pull in the matchers here.
require('@nomicfoundation/hardhat-chai-matchers');
const { expect } = require('chai');
const { ethers } = require('hardhat');

const HAT = 42n;

describe('PodEligibilityModule', () => {
  let hats, registry, criteria, module, admin, stranger, member, agent;

  beforeEach(async () => {
    [admin, stranger, member, agent] = await ethers.getSigners();
    hats = await (await ethers.getContractFactory('MockHatsAdmin')).deploy();
    registry = await (await ethers.getContractFactory('MockAgentRegistry')).deploy();
    criteria = await (await ethers.getContractFactory('MockCriteria')).deploy();
    module = await (await ethers.getContractFactory('PodEligibilityModule')).deploy(
      await hats.getAddress(),
      await registry.getAddress(),
      await criteria.getAddress(),
    );
    await hats.setAdmin(HAT, admin.address, true);
  });

  const status = async (who) => module.getWearerStatus(who, HAT);

  it('a human with no revocation and passing criteria is eligible, in good standing', async () => {
    expect(await status(member.address)).to.deep.equal([true, true]);
  });

  it('a registered agent is ineligible but in good standing (exclusion, not punishment)', async () => {
    await registry.setRegistered(agent.address, true);
    expect(await status(agent.address)).to.deep.equal([false, true]);
  });

  it('a hat admin can revoke; the wearer becomes ineligible, standing stays good', async () => {
    await expect(module.connect(admin).revoke(HAT, member.address))
      .to.emit(module, 'WearerRevoked')
      .withArgs(HAT, member.address, admin.address);
    expect(await status(member.address)).to.deep.equal([false, true]);
  });

  it('a non-admin cannot revoke or reinstate', async () => {
    await expect(module.connect(stranger).revoke(HAT, member.address)).to.be.revertedWithCustomError(
      module,
      'NotHatAdmin',
    );
    await expect(module.connect(stranger).reinstate(HAT, member.address)).to.be.revertedWithCustomError(
      module,
      'NotHatAdmin',
    );
  });

  it('admin status is per hat: an admin of another hat cannot revoke this one', async () => {
    await hats.setAdmin(HAT, admin.address, false);
    await hats.setAdmin(HAT + 1n, admin.address, true);
    await expect(module.connect(admin).revoke(HAT, member.address)).to.be.revertedWithCustomError(
      module,
      'NotHatAdmin',
    );
  });

  it('reinstate lifts the revocation', async () => {
    await module.connect(admin).revoke(HAT, member.address);
    await expect(module.connect(admin).reinstate(HAT, member.address))
      .to.emit(module, 'WearerReinstated')
      .withArgs(HAT, member.address, admin.address);
    expect(await status(member.address)).to.deep.equal([true, true]);
  });

  it('revocation is per hat: revoked on one hat, still eligible on another', async () => {
    await module.connect(admin).revoke(HAT, member.address);
    expect(await module.getWearerStatus(member.address, HAT + 1n)).to.deep.equal([true, true]);
  });

  it('a failing criterion makes a human ineligible; agent exclusion is checked first', async () => {
    await criteria.setIneligible(member.address, true);
    expect(await status(member.address)).to.deep.equal([false, true]);
    // An agent that would pass criteria is still excluded.
    await registry.setRegistered(agent.address, true);
    expect(await status(agent.address)).to.deep.equal([false, true]);
  });

  it('with no criteria module, humans are simply eligible', async () => {
    const bare = await (await ethers.getContractFactory('PodEligibilityModule')).deploy(
      await hats.getAddress(),
      await registry.getAddress(),
      ethers.ZeroAddress,
    );
    expect(await bare.getWearerStatus(member.address, HAT)).to.deep.equal([true, true]);
  });

  it('rejects a zero Hats or registry address at construction', async () => {
    const F = await ethers.getContractFactory('PodEligibilityModule');
    await expect(F.deploy(ethers.ZeroAddress, await registry.getAddress(), ethers.ZeroAddress)).to.be.revertedWithCustomError(
      F,
      'InvalidAddress',
    );
    await expect(F.deploy(await hats.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress)).to.be.revertedWithCustomError(
      F,
      'InvalidAddress',
    );
  });
});
