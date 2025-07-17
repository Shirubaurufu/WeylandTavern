import path from 'node:path';
import fs from 'node:fs';
import { getRealIpFromHeader } from '../express-common.js';
import { color, getConfigValue } from '../util.js';

const enableAccessLog = getConfigValue('logging.enableAccessLog', true, 'boolean');

const knownIPs = new Set();

export const getAccessLogPath = () => path.join(globalThis.DATA_ROOT, 'access.log');

export function migrateAccessLog() {
    try {
        if (!fs.existsSync('access.log')) {
            return;
        }
        const logPath = getAccessLogPath();
        if (fs.existsSync(logPath)) {
            return;
        }
        fs.renameSync('access.log', logPath);
        
    } catch (e) {
        
        
    }
}

/**
 * Creates middleware for logging access and new connections
 * @returns {import('express').RequestHandler}
 */
export default function accessLoggerMiddleware() {
    return function (req, res, next) {
        const clientIp = getRealIpFromHeader(req);
        const userAgent = req.headers['user-agent'];

        if (!knownIPs.has(clientIp)) {
            // Log new connection
            
            knownIPs.add(clientIp);

            // Write to access log if enabled
            if (enableAccessLog) {
                const logPath = getAccessLogPath();
                const timestamp = new Date().toISOString();
                const log = `${timestamp} ${clientIp} ${userAgent}\n`;

                fs.appendFile(logPath, log, (err) => {
                    if (err) {
                        
                    }
                });
            }
        }

        next();
    };
}
