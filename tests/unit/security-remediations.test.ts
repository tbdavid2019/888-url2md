import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIpForbidden, privateIpNotAcceptable } from '../../build/services/misc.js';
import { isIPInNonPublicRange } from '../../build/utils/ip.js';
import { assertSafeWebhookUrl } from '../../build/dto/advanced-crawl-options.js';

describe('Security Remediation Suite', () => {
    describe('SSRF & Non-public IP range validation', () => {
        it('identifies private and loopback IPv4/IPv6 addresses', () => {
            assert.equal(isIPInNonPublicRange('127.0.0.1'), true);
            assert.equal(isIPInNonPublicRange('10.0.0.1'), true);
            assert.equal(isIPInNonPublicRange('172.16.0.1'), true);
            assert.equal(isIPInNonPublicRange('192.168.1.1'), true);
            assert.equal(isIPInNonPublicRange('169.254.169.254'), true);
            assert.equal(isIPInNonPublicRange('::1'), true);
            assert.equal(isIPInNonPublicRange('fc00::1'), true);
            assert.equal(isIPInNonPublicRange('8.8.8.8'), false);
            assert.equal(isIPInNonPublicRange('1.1.1.1'), false);
            assert.equal(isIPInNonPublicRange('93.184.216.34'), false);
        });

        it('isPrivateIpForbidden respects environment configuration', () => {
            const origBlock = process.env.BLOCK_PRIVATE_IP;
            const origAllow = process.env.ALLOW_PRIVATE_NETWORK;
            const origNodeEnv = process.env.NODE_ENV;

            try {
                process.env.ALLOW_PRIVATE_NETWORK = 'true';
                assert.equal(isPrivateIpForbidden(), false);

                delete process.env.ALLOW_PRIVATE_NETWORK;
                process.env.BLOCK_PRIVATE_IP = 'true';
                assert.equal(isPrivateIpForbidden(), true);

                delete process.env.BLOCK_PRIVATE_IP;
                process.env.NODE_ENV = 'production';
                assert.equal(isPrivateIpForbidden(), true);
            } finally {
                if (origBlock !== undefined) process.env.BLOCK_PRIVATE_IP = origBlock;
                else delete process.env.BLOCK_PRIVATE_IP;
                if (origAllow !== undefined) process.env.ALLOW_PRIVATE_NETWORK = origAllow;
                else delete process.env.ALLOW_PRIVATE_NETWORK;
                if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
                else delete process.env.NODE_ENV;
            }
        });

        it('assertSafeWebhookUrl blocks private IP and localhost webhooks', () => {
            assert.throws(() => assertSafeWebhookUrl('https://localhost:8080/callback'), /localhost/);
            assert.throws(() => assertSafeWebhookUrl('https://127.0.0.1:8080/callback'), /localhost/);
            assert.throws(() => assertSafeWebhookUrl('https://169.254.169.254/callback'), /localhost/);
            assert.throws(() => assertSafeWebhookUrl('https://10.0.0.1/callback'), /localhost/);
            assert.throws(() => assertSafeWebhookUrl('http://example.com/callback'), /HTTPS/);
            assert.equal(assertSafeWebhookUrl('https://example.com/callback'), 'https://example.com/callback');
        });
    });
});

