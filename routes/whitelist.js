const express = require('express');
const pool = require('../db'); // Adjust the path according to your setup
const router = express.Router();

// Configure Express to trust the first proxy if behind one
router.use((req, res, next) => {
    req.app.set('trust proxy', true);
    next();
});

const normalizeIp = (ip) => {
    if (ip === '::1') {
        return '127.0.0.1'; // Normalize IPv6 loopback address to IPv4
    }
    if (ip.includes('::ffff:')) {
        return ip.split('::ffff:')[1];
    }
    return ip;
};

router.get('/ip', (req, res) => {
    const clientIp = normalizeIp(req.ip);
    res.send(`Your IP is ${clientIp}`);
});

router.get('/', async (req, res) => {
    try {
        const clientIp = normalizeIp(req.ip); // Normalize the IP address
        const imei = req.headers['x-imei'] || ''; // Assume IMEI is sent in a custom header, default to empty string

        console.log('Client IP:', clientIp);
        console.log('Client IMEI:', imei);

        const queryText = `
            SELECT ip, LENGTH(ip) as ip_length, imei, LENGTH(imei) as imei_length, enabled 
            FROM whitelist 
            WHERE (TRIM(ip) = $1 OR TRIM(imei) = $2) 
            AND enabled = true
        `;
        const { rows } = await pool.query(queryText, [clientIp, imei]);
        console.log('Whitelist query result:', rows);

        if (rows.length > 0) {
            console.log('You have access');
            res.json({ message: 'success', ip: { clientIp: clientIp, imei: imei } }); // IP or IMEI is whitelisted and enabled
        } else {
            console.log('You shall not pass');
            res.status(403).json({ error: 'Access denied test', ip: { clientIp: clientIp, imei: imei } }); // IP or IMEI is not whitelisted or not enabled
        }
    } catch (error) {
        console.error('Error checking whitelist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
