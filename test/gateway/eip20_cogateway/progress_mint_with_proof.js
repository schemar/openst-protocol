// Copyright 2019 OpenST Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// ----------------------------------------------------------------------------
//
// http://www.simpletoken.org/
//
// ----------------------------------------------------------------------------

const BN = require('bn.js'),
  Utils = require('../../test_lib/utils'),
  coGatewayUtils = require('./helpers/co_gateway_utils.js'),
  TestData = require('./test_data/stake_progressed_1'),
  TestEIP20CoGateway = artifacts.require('TestEIP20CoGateway'),
  TestUtilityToken = artifacts.require('TestUtilityToken'),
  TestDataWithZeroGasPrice = require('./test_data/stake_progressed_3'),
  messageBus = require('../../test_lib/message_bus.js');

let MessageStatusEnum = messageBus.MessageStatusEnum;

let testUtilityToken,
  symbol = 'OST',
  name = 'Simple Token',
  decimals = 18,
  testEIP20CoGateway,
  messageHash;

async function getMaxReward(stubData) {

  let gasPrice = new BN(stubData.gateway.stake.params.gasPrice, 16),
    gasLimit = new BN(stubData.gateway.stake.params.gasLimit, 16),
    maxReward = new BN(gasPrice * gasLimit);

  return maxReward;
}

contract('EIP20CoGateway.progressMintWithProof() ', function (accounts) {

  let facilitator = accounts[5],
    intentHash,
    params = {};

  beforeEach(async function () {

    let valueToken = accounts[0],
      burner = accounts[10],
      bountyAmount = new BN(100);

    testUtilityToken = await TestUtilityToken.new(
      TestData.contracts.mockToken,
      symbol,
      name,
      decimals,
      TestData.contracts.organization,
    );

    params.amount = new BN(TestData.gateway.stake.params.amount, 16);
    params.beneficiary = TestData.gateway.stake.params.beneficiary;
    params.nonce = new BN(TestData.gateway.stake.params.nonce, 16);
    params.gasPrice = new BN(TestData.gateway.stake.params.gasPrice, 16);
    params.gasLimit = new BN(TestData.gateway.stake.params.gasLimit, 16);
    params.staker = TestData.gateway.stake.params.staker;
    params.hashLock = TestData.gateway.stake.params.hashLock;
    params.blockNumber = new BN(TestData.gateway.stake.return_value.block_number, 16);
    params.storageHash = TestData.gateway.stake.proof_data.storageHash;
    params.serializedProof = TestData.gateway.stake.proof_data.storageProof[0].serializedProof;

    testEIP20CoGateway = await TestEIP20CoGateway.new(
      valueToken,
      testUtilityToken.address,
      TestData.contracts.anchor,
      bountyAmount,
      TestData.contracts.organization,
      TestData.contracts.gateway,
      burner,
    );

    intentHash = coGatewayUtils.hashStakeIntent(
      params.amount,
      params.beneficiary,
      TestData.contracts.gateway,
    );

    await testUtilityToken.setCoGatewayAddress(testEIP20CoGateway.address);

    messageHash = await testEIP20CoGateway.setMessage.call(
      intentHash,
      params.nonce,
      params.gasPrice,
      params.gasLimit,
      params.staker,
      params.hashLock,
    );

    await testEIP20CoGateway.setInboxStatus(
      messageHash,
      MessageStatusEnum.Declared,
    );

    await testEIP20CoGateway.setMessage(
      intentHash,
      params.nonce,
      params.gasPrice,
      params.gasLimit,
      params.staker,
      params.hashLock,
    );

    await testEIP20CoGateway.setMints(
      messageHash,
      params.beneficiary,
      params.amount,
    );

    await testEIP20CoGateway.setStorageRoot(
      params.blockNumber,
      params.storageHash
    );

  });

  it('should emit event MintProgressed', async function () {

    let estimatedReward = await getMaxReward(TestData);
    let estimatedStakeAmount = params.amount.sub(estimatedReward);

    let response = await testEIP20CoGateway.progressMintWithProof(
      messageHash,
      params.serializedProof,
      params.blockNumber,
      MessageStatusEnum.Declared,
      {from: facilitator},
    );

    let expectedEvent = {
      MintProgressed: {
        _messageHash: messageHash,
        _staker: params.staker,
        _stakeAmount: params.amount,
        _mintedAmount: estimatedStakeAmount,
        _rewardAmount: estimatedReward,
        _proofProgress: true,
        _unlockSecret: Utils.ZERO_BYTES32
      }
    };

    let eventData = response.logs;
    Utils.validateEvents(eventData, expectedEvent);

  });

  it('should return correct params', async function () {

    let response = await testEIP20CoGateway.progressMintWithProof.call(
      messageHash,
      TestData.gateway.stake.proof_data.storageProof[0].serializedProof,
      new BN(TestData.gateway.stake.return_value.block_number, 16),
      MessageStatusEnum.Declared,
      {from: facilitator},
    );

    assert.strictEqual(
      response.beneficiary_,
      params.beneficiary,
      `Beneficiary address is ${response.beneficiary_}. It should be ${params.beneficiary}`,
    );

    assert.strictEqual(
      params.amount.eq(response.stakeAmount_),
      true,
      `Staked amount ${response.stakeAmount_} from event should be ${params.amount}.`,
    );

    let expectedReward = await getMaxReward(TestData);
    assert.strictEqual(
      expectedReward.eq(response.rewardAmount_),
      true,
      `Reward to facilitator from event ${response.rewardAmount_} should be ${expectedReward}.`,
    );

    let expectedStakedAmount = params.amount.sub(expectedReward);
    assert.strictEqual(
      expectedStakedAmount.eq(response.mintedAmount_),
      true,
      `Minted amount ${response.mintedAmount_} from event should be ${expectedStakedAmount}.`,
    );

  });

  it('should progress mint for non-zero facilitator reward when message status at source is declared', async function () {

    let initialFacilitatorBalance = await testUtilityToken.balanceOf(facilitator);

    await testEIP20CoGateway.progressMintWithProof(
      messageHash,
      params.serializedProof,
      params.blockNumber,
      MessageStatusEnum.Declared,
      {from: facilitator},
    );

    let expectedRewardAmount = await getMaxReward(TestData);

    let finalFacilitatorBalance = await testUtilityToken.balanceOf(facilitator);

    assert.strictEqual(
      expectedRewardAmount.add(initialFacilitatorBalance).eq(finalFacilitatorBalance),
      true,
      `Facilitator reward should be ${expectedRewardAmount.add(initialFacilitatorBalance)}.`,
    );

  });

  it('should progress mint for non-zero facilitator reward when message status at source is progressed', async function () {

    let initialFacilitatorBalance = await testUtilityToken.balanceOf(facilitator),
      initialBeneficiaryBalance = await testUtilityToken.balanceOf(params.beneficiary);

    await testEIP20CoGateway.setStorageRoot(
      new BN(TestData.gateway.progress_stake.return_value.block_number, 16),
      TestData.gateway.progress_stake.proof_data.storageHash
    );

    await testEIP20CoGateway.progressMintWithProof(
      messageHash,
      TestData.gateway.progress_stake.proof_data.storageProof[0].serializedProof,
      new BN(TestData.gateway.progress_stake.return_value.block_number, 16),
      MessageStatusEnum.Progressed,
      {from: facilitator},
    );

    let expectedRewardAmount = await getMaxReward(TestData),
      finalFacilitatorBalance = await testUtilityToken.balanceOf(facilitator),
      finalBeneficiaryBalance = await testUtilityToken.balanceOf(params.beneficiary);

    assert.strictEqual(
      expectedRewardAmount.add(initialFacilitatorBalance).eq(finalFacilitatorBalance),
      true,
      `Facilitator reward should be ${expectedRewardAmount.add(initialFacilitatorBalance)}.`,
    );

    let stakedAmount = new BN(params.amount, 16);

    assert.strictEqual(
      initialBeneficiaryBalance.add(stakedAmount.sub(expectedRewardAmount)).eq(finalBeneficiaryBalance),
      true,
      `Beneficiary balance should be ${initialBeneficiaryBalance.add(stakedAmount).sub(expectedRewardAmount)}.`,
    );

  });

  it('should mint tokens to beneficiary', async function () {

    let initialBeneficiaryBalance = await testUtilityToken.balanceOf(params.beneficiary);

    await testEIP20CoGateway.progressMintWithProof(
      messageHash,
      params.serializedProof,
      params.blockNumber,
      MessageStatusEnum.Declared,
      {from: facilitator},
    );

    let expectedRewardAmount = await getMaxReward(TestData),
      finalBeneficiaryBalance = await testUtilityToken.balanceOf(params.beneficiary);

    let stakedAmount = new BN(params.amount, 16);

    assert.strictEqual(
      initialBeneficiaryBalance.add(stakedAmount.sub(expectedRewardAmount)).eq(finalBeneficiaryBalance),
      true,
      `Beneficiary balance should be ${initialBeneficiaryBalance.add(stakedAmount).sub(expectedRewardAmount)}.`,
    );

  });

  it('should progress mint for zero facilitator reward', async function () {

    intentHash = coGatewayUtils.hashStakeIntent(
      new BN(TestDataWithZeroGasPrice.gateway.stake.params.amount, 16),
      TestDataWithZeroGasPrice.gateway.stake.params.beneficiary,
      TestDataWithZeroGasPrice.contracts.gateway,
    );

    messageHash = await testEIP20CoGateway.setMessage.call(
      intentHash,
      new BN(TestDataWithZeroGasPrice.gateway.stake.params.nonce, 16),
      new BN(TestDataWithZeroGasPrice.gateway.stake.params.gasPrice, 16),
      new BN(TestDataWithZeroGasPrice.gateway.stake.params.gasLimit, 16),
      TestDataWithZeroGasPrice.gateway.stake.params.staker,
      TestDataWithZeroGasPrice.gateway.stake.params.hashLock,
    );

    await testEIP20CoGateway.setMessage(
      intentHash,
      new BN(TestDataWithZeroGasPrice.gateway.stake.params.nonce, 16),
      new BN(TestDataWithZeroGasPrice.gateway.stake.params.gasPrice, 16),
      new BN(TestDataWithZeroGasPrice.gateway.stake.params.gasLimit, 16),
      TestDataWithZeroGasPrice.gateway.stake.params.staker,
      TestDataWithZeroGasPrice.gateway.stake.params.hashLock,
    );

    await testEIP20CoGateway.setMints(
      messageHash,
      TestDataWithZeroGasPrice.gateway.stake.params.beneficiary,
      new BN(TestDataWithZeroGasPrice.gateway.stake.params.amount, 16)
    );

    await testEIP20CoGateway.setStorageRoot(
      new BN(TestDataWithZeroGasPrice.gateway.stake.return_value.block_number, 16),
      TestDataWithZeroGasPrice.gateway.stake.proof_data.storageHash
    );

    await testEIP20CoGateway.setInboxStatus(
      messageHash,
      MessageStatusEnum.Declared,
    );

    let initialFacilitatorBalance = await testUtilityToken.balanceOf(facilitator);

    await testEIP20CoGateway.progressMintWithProof(
      messageHash,
      TestDataWithZeroGasPrice.gateway.stake.proof_data.storageProof[0].serializedProof,
      new BN(TestDataWithZeroGasPrice.gateway.stake.return_value.block_number, 16),
      MessageStatusEnum.Declared,
      {from: facilitator},
    );

    let expectedRewardAmount = await getMaxReward(TestDataWithZeroGasPrice),
      finalFacilitatorBalance = await testUtilityToken.balanceOf(facilitator);

    assert.strictEqual(
      expectedRewardAmount.add(initialFacilitatorBalance).eq(finalFacilitatorBalance),
      true,
      `Facilitator reward should be ${expectedRewardAmount.add(initialFacilitatorBalance)}.`,
    );

  });

  it('should fail when messagehash is zero', async function () {

    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        Utils.NULL_ADDRESS,
        params.serializedProof,
        params.blockNumber,
        MessageStatusEnum.Declared,
        {from: facilitator},
      ),
      'Message hash must not be zero',
    );

  });

  it('should fail when rlp of parent nodes is zero', async function () {

    let rlpParentNodes = "0x";
    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        messageHash,
        rlpParentNodes,
        params.blockNumber,
        MessageStatusEnum.Declared,
        {from: facilitator},
      ),
      'RLP parent nodes must not be zero',
    );

  });

  it('should fail when storage root for block height is not set', async function () {

    let blockHeight = new BN(1);
    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        messageHash,
        params.serializedProof,
        blockHeight,
        MessageStatusEnum.Declared,
        {from: facilitator},
      ),
      'Storage root must not be zero',
    );

  });

  it('should fail when message status is declared revocation', async function () {

    await testEIP20CoGateway.setInboxStatus(
      messageHash,
      MessageStatusEnum.DeclaredRevocation,
    );

    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        messageHash,
        params.serializedProof,
        params.blockNumber,
        MessageStatusEnum.Declared,
        {from: facilitator},
      ),
      'Message on target must be Declared.',
    );

  });

  it('should fail when message status is revoked', async function () {

    await testEIP20CoGateway.setInboxStatus(
      messageHash,
      MessageStatusEnum.Revoked,
    );

    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        messageHash,
        params.serializedProof,
        params.blockNumber,
        MessageStatusEnum.Declared,
        {from: facilitator},
      ),
      'Message on target must be Declared.',
    );

  });

  it('should fail when message status is undeclared', async function () {

    await testEIP20CoGateway.setInboxStatus(
      messageHash,
      MessageStatusEnum.Undeclared,
    );

    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        messageHash,
        params.serializedProof,
        params.blockNumber,
        MessageStatusEnum.Declared,
        {from: facilitator},
      ),
      'Message on target must be Declared.',
    );

  });

  it('should fail when message status at source is DeclaredRevocation', async function () {

    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        messageHash,
        params.serializedProof,
        params.blockNumber,
        MessageStatusEnum.DeclaredRevocation,
        {from: facilitator},
      ),
      'Message on source must be Declared or Progressed.',
    );

  });

  it('should fail when message status at source is Revoked', async function () {

    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        messageHash,
        params.serializedProof,
        params.blockNumber,
        MessageStatusEnum.Revoked,
        {from: facilitator},
      ),
      'Message on source must be Declared or Progressed.',
    );

  });

  it('should fail when message status is undeclared', async function () {

    await testEIP20CoGateway.setInboxStatus(
      messageHash,
      MessageStatusEnum.Undeclared,
    );

    await Utils.expectRevert(
      testEIP20CoGateway.progressMintWithProof.call(
        messageHash,
        params.serializedProof,
        params.blockNumber,
        MessageStatusEnum.Declared,
        {from: facilitator},
      ),
      'Message on target must be Declared.',
    );

  });

  it('should fail when message status is already progressed', async function () {

    await testEIP20CoGateway.progressMintWithProof(
      messageHash,
      params.serializedProof,
      params.blockNumber,
      MessageStatusEnum.Declared,
      {from: facilitator},
    );

    await Utils.expectRevert(testEIP20CoGateway.progressMintWithProof(
      messageHash,
      params.serializedProof,
      params.blockNumber,
      MessageStatusEnum.Progressed,
      {from: facilitator},
      ),
      'Message on target must be Declared.',
    );

  });

});
