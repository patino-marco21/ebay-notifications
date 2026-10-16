/*
 * *
 *  * Copyright 2021 eBay Inc.
 *  *
 *  * Licensed under the Apache License, Version 2.0 (the "License");
 *  * you may not use this file except in compliance with the License.
 *  * You may obtain a copy of the License at
 *  *
 *  *  http://www.apache.org/licenses/LICENSE-2.0
 *  *
 *  * Unless required by applicable law or agreed to in writing, software
 *  * distributed under the License is distributed on an "AS IS" BASIS,
 *  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  * See the License for the specific language governing permissions and
 *  * limitations under the License.
 *  *
 */

/* eslint-disable no-console */
/* eslint-disable max-len */

'use strict';

const express = require('express');
const app = express();

function loadConfig() {
    // 1. Environment variables (Render) take precedence
    if (process.env.EBAY_CLIENT_ID && process.env.EBAY_ENDPOINT) {
        return {
            SANDBOX: {
                clientId: process.env.EBAY_SANDBOX_CLIENT_ID || 'sandbox-not-configured',
                clientSecret: process.env.EBAY_SANDBOX_CLIENT_SECRET || 'sandbox-not-configured',
                devId: process.env.EBAY_SANDBOX_DEV_ID || 'sandbox-not-configured',
                redirectUri: process.env.EBAY_SANDBOX_REDIRECT_URI || '',
                baseUrl: 'api.sandbox.ebay.com'
            },
            PRODUCTION: {
                clientId: process.env.EBAY_CLIENT_ID,
                clientSecret: process.env.EBAY_CLIENT_SECRET,
                devId: process.env.EBAY_DEV_ID || 'dev-id-not-configured',
                redirectUri: process.env.EBAY_REDIRECT_URI || '',
                baseUrl: 'api.ebay.com'
            },
            endpoint: process.env.EBAY_ENDPOINT,
            verificationToken: process.env.EBAY_VERIFICATION_TOKEN
        };
    }
    // 2. Render secret file
    try {
        return require('/etc/secrets/ebay-config.json');
    } catch (e) {
        // 3. Local fallback (development)
        return require('./config.json');
    }
}

const config = loadConfig();
const constants = require('../lib/constants');
const EventNotificationSDK = require('../lib/index');

const environment = 'PRODUCTION';
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.post('/webhook', (req, res) => {
    EventNotificationSDK.process(
        req.body,
        req.headers[constants.X_EBAY_SIGNATURE],
        config,
        environment
    ).then((responseCode) => {
        if (responseCode === constants.HTTP_STATUS_CODE.NO_CONTENT) {
            console.log(`Message processed successfully for: \n- Topic: ${req.body.metadata.topic} \n- NotificationId: ${req.body.notification.notificationId}\n`);
        } else if (responseCode === constants.HTTP_STATUS_CODE.PRECONDITION_FAILED) {
            console.error(`Signature mismatch for: \n- Payload: ${JSON.stringify(req.body)} \n- Signature: ${req.headers[constants.X_EBAY_SIGNATURE]}\n`);
        }
        res.status(responseCode).send();
    }).catch((ex) => {
        console.error(`Signature validation processing failure: ${ex}\n`);
        res.status(constants.HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR).send();
    });
});

app.get('/webhook', (req, res) => {
    if (req.query.challenge_code) {
        try {
            const challengeResponse = EventNotificationSDK.validateEndpoint(
                req.query.challenge_code,
                config);
            res.status(200).send({
                challengeResponse: challengeResponse
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(`Endpoint validation failure: ${e}`);
            res.status(constants.HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR).send();
        }
    } else {
        res.status(constants.HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR).send();
    }
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening at http://localhost:${PORT}`);
});
