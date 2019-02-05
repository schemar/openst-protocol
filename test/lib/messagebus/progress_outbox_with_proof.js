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
// Test: ProgressOutboxWithProof.js
//
// http://www.simpletoken.org/
//
// ----------------------------------------------------------------------------

const MessageBusUtils = require('./messagebus_utils');

const messageBusUtils = new MessageBusUtils();
const messageBus = require('../../test_lib/message_bus.js');

const MessageStatusEnum = messageBus.MessageStatusEnum;

contract('MessageBus.progressOutboxWithProof()', async (accounts) => {
    let params;

    beforeEach(async () => {
        await messageBusUtils.deployedMessageBus();
        params = messageBusUtils.defaultParams(accounts);
    });

    it('should fail when message status at target is revoked and message'
      + ' status at source is undeclared', async () => {
        params.messageStatus = MessageStatusEnum.Revoked;
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is revoked and message'
      + ' status at source is declared', async () => {
        await messageBusUtils.declareMessage(params, true);

        params.messageStatus = MessageStatusEnum.Revoked;
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is revoked and message'
      + ' status at source is progressed', async () => {
        await messageBusUtils.declareMessage(params, true);
        params.messageStatus = MessageStatusEnum.Declared;
        await messageBusUtils.progressOutboxWithProof(params, true);

        params.messageStatus = MessageStatusEnum.Revoked;
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is revoked and message status at source is'
      + ' revoked', async () => {
        await messageBusUtils.declareMessage(params, true);
        await messageBusUtils.declareRevocationMessage(params, true);
        params.messageStatus = MessageStatusEnum.Revoked;
        await messageBusUtils.progressOutboxRevocation(params, true);

        params.messageStatus = MessageStatusEnum.Revoked;
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is undeclared and message'
      + ' status at source is undeclared', async () => {
        params.messageStatus = '';
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is undeclared and message'
      + ' status is at source  progressed', async () => {
        await messageBusUtils.declareMessage(params, true);
        await messageBusUtils.progressOutboxWithProof(params, true);

        params.messageStatus = '';
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is undeclared and message'
      + ' status at source is revoked', async () => {
        await messageBusUtils.declareMessage(params, true);
        await messageBusUtils.declareRevocationMessage(params, true);
        params.messageStatus = MessageStatusEnum.Revoked;
        await messageBusUtils.progressOutboxRevocation(params, true);

        params.messageStatus = '';
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is undeclared and message'
      + ' status at source is declared revocation', async () => {
        await messageBusUtils.declareMessage(params, true);
        await messageBusUtils.declareRevocationMessage(params, true);

        params.messageStatus = MessageStatusEnum.Undeclared;
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is declared and message'
      + ' status at source is declared revocation', async () => {
        await messageBusUtils.declareMessage(params, true);
        await messageBusUtils.declareRevocationMessage(params, true);

        params.messageStatus = MessageStatusEnum.Declared;
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should fail when message status at target is revoked and message'
      + ' status at source is declared revocation', async () => {
        await messageBusUtils.declareMessage(params, true);
        await messageBusUtils.declareRevocationMessage(params, true);

        params.messageStatus = MessageStatusEnum.Revoked;
        await messageBusUtils.progressOutboxWithProof(params, false);
    });

    it('should pass when message status at target is progressed and source'
      + ' is declared revocation', async () => {
        await messageBusUtils.declareMessage(params, true);
        await messageBusUtils.declareRevocationMessage(params, true);
        params.messageStatus = MessageStatusEnum.Revoked;
        await messageBusUtils.progressOutboxRevocation(params, true);
    });
});
