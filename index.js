process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');
const dns = require('dns');
const dnsPromises = dns.promises;
const nodemailer = require('nodemailer');

const url = process.env.MONGODB_URL;
const client = new MongoClient(url);

const dbName = 'solun';
const user_collection = 'users';
const user_domain_collection = 'user_domains';

async function sendMail(to, subject, html) {
  let transporter = nodemailer.createTransport({
    host: 'ms.solun.pm',
    port: 465,
    secure: true,
    auth: {
      user: 'admin@solun.pm',
      pass: process.env.SOLUN_ADMIN_PASSWORD
    }
  });

  let info = await transporter.sendMail({
    from: '"Solun Support" <support@solun.pm>',
    to: to,
    subject: subject,
    html: html
  });

  console.log('Message sent: %s', info.messageId);
}

async function verifyDNSRecords(db, domain, dnsRecords) {
  let allRecordsCorrect = true;
  console.log(dnsRecords)
  for (let record of dnsRecords) {
    console.log("### Record:", record.type, record.name, record.data, "###")
    switch (record.type) {
      case 'MX':
        try {
          const mxRecords = await dnsPromises.resolveMx(domain.domain);
          console.log('Expected MX:', record.data);
          console.log('Actual MX:', mxRecords[0]?.exchange);
          if (!mxRecords || mxRecords[0].exchange != record.data) {
            allRecordsCorrect = false;
          }
        } catch (err) {
          allRecordsCorrect = false;
        }
        break;
      case 'CNAME':
        try {
          const cnameRecords = await dnsPromises.resolveCname(domain.domain);
          console.log('Expected CNAME:', record.data);
          console.log('Actual CNAME:', cnameRecords[0]);
          if (!cnameRecords || cnameRecords[0] != record.data) {
            allRecordsCorrect = false;
          }
        }
        catch (err) {
          allRecordsCorrect = false;
        }
        break;
      case 'TXT':
        try {
          const subdomain = record.name ? record.name : domain.domain;
          const txtRecords = await dnsPromises.resolveTxt(subdomain);
          console.log('Expected TXT:', record.data);
          for (let txtRecord of txtRecords.flat()) {
            console.log('Actual TXT:', txtRecord);
            if (txtRecord !== record.data) {
              allRecordsCorrect = false;
            }
          }
        }
        catch (err) {
          allRecordsCorrect = false;
        }
        break;             
      case 'SRV':
        try {
          const srvRecords = await dnsPromises.resolveSrv(domain.domain);
          console.log('Expected SRV:', record.data);
          console.log('Actual SRV:', srvRecords[0]?.name);
          if (!srvRecords || srvRecords[0].name != record.data) {
            allRecordsCorrect = false;
          }
        }
        catch (err) {
          allRecordsCorrect = false;
        }
        break;
    }
  }

  if (allRecordsCorrect) {
    const domains = db.collection(user_domain_collection);
    await domains.updateOne({ domain: domain.domain }, { $set: { verification_status: 'active' } });
  
    const htmlContent = `
      <div style="background-color: #4F46E5; color: #1D3F5E">
        <h1>Hello ${user.username},</h1>
        <p>Your domain ${domain.domain} is now active!</p>
        <p>Thank you for using Solun!</p>
      </div>
    `;
  
    await sendMail(user.fqe, 'Your Domain is Active', htmlContent);
  } else {
    console.log("### DNS Records Incorrect for Domain:", domain.domain, "###")
    const domains = db.collection(user_domain_collection);
    await domains.updateOne({ domain: domain.domain }, { $set: { verification_status: 'pending' } });
  }
}

async function run() {
  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection(user_collection);
    const domains = db.collection(user_domain_collection);

    const cursor = domains.find({
      verification_status: {
        $nin: ['inactive', 'active']
      }
    });

    while (await cursor.hasNext()) {
      const domain = await cursor.next();
      const user = await users.findOne({ user_id: domain.user_id });
      console.log("### Domain:", domain.domain, "###");
      console.log("### Owner:", user.fqe, "###");
      console.log("### Verification Status:", domain.verification_status, "###");
      console.log("### Created At:", new Date(domain.createdAt).toLocaleString(), "###");

      await fetch(process.env.API_URL + '/user/domain/get_dns_records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.API_KEY
        },
        body: JSON.stringify({
          domain: domain.domain
        })
      })
      .then(res => res.json())
      .then(async json => {
        await verifyDNSRecords(db, domain, json);
      })      
      .catch(err => console.log(err));      
    }
  } finally {
    console.log("### Script End @", new Date(), "###");
    await client.close();
  }
}

console.log("### Solun Check DNS ###");
console.log("### Script Start @", new Date(), "###");
run().catch(console.dir);

setInterval(async () => {
  console.log("### Script Restart @", new Date(), "###");
  await run().catch(console.dir);
}, 60000); // 60000 milliseconds = 1 minute