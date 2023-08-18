// sprocess.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');
const dns = require('dns');
const dnsPromises = dns.promises;
const nodemailer = require('nodemailer');

const url = process.env.MONGODB_URL;
const client = new MongoClient(url);

const dbName = 'solun_proj';
const user_collection = 'users';
const user_domain_collection = 'user_domains';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function logInColor(message, status) {
  const color = status === 'Correct' ? '\x1b[32m' : '\x1b[31m';
  console.log(color, message, '\x1b[0m');
}

async function verifyDNSRecords(db, domain, dnsRecords) {
  let allRecordsCorrect = true;
  for (let record of dnsRecords) {
    switch (record.type) {
      case 'MX':
        try {
          const mxRecords = await dnsPromises.resolveMx(record.name);
          //console.log('Expected MX:', record.data);
          //console.log('Actual MX:', mxRecords[0]?.exchange);
          if (!mxRecords || mxRecords[0].exchange != record.data) {
            allRecordsCorrect = false;
            logInColor('MX Check: Wrong', 'Wrong');
          } else {
            logInColor('MX Check: Correct', 'Correct');
          }
        } catch (err) {
          allRecordsCorrect = false;
          console.log('Error at querying MX Record');
        }
        break;
      case 'CNAME':
        try {
          logInColor('CNAME Check: Skipped', 'Correct');
          //const cnameRecords = await dnsPromises.resolveCname(record.name);
          //console.log('Expected CNAME:', record.data);
          //console.log('Actual CNAME:', cnameRecords[0]);
          //if (!cnameRecords || cnameRecords[0] != record.data) {
          //  allRecordsCorrect = false;
          //  logInColor('CNAME Check: Wrong', 'Wrong');
          //} else {
          //  logInColor('CNAME Check: Correct', 'Correct');
          //}
        }
        catch (err) {
          allRecordsCorrect = false;
          console.log('Error at querying CNAME Record');
        }
        break;
      case 'TXT':
        try {
          logInColor('TXT & DKIM Check: Skipped', 'Correct');
          //const txtRecords = await dnsPromises.resolveTxt(record.name);
          //if (record.name.includes('dkim')) { // Only apply this check for DKIM records
          //  let combinedTxtRecord = txtRecords.flat().join(''); // Combine all parts
            //console.log('Expected TXT:', record.data);
            //console.log('Actual TXT:', combinedTxtRecord);
          //  if (combinedTxtRecord !== record.data) {
          //    allRecordsCorrect = false;
          //    logInColor('DKIM Check: Wrong', 'Wrong');
          //  } else {
          //    logInColor('DKIM Check: Correct', 'Correct');
          //  }
          //} else { // For non-DKIM TXT records
          //  let matchFound = false;
            //console.log('Expected TXT:', record.data);
          //  for (let txtRecord of txtRecords.flat()) {
          //    //console.log('Actual TXT:', txtRecord);
          //    if (txtRecord === record.data) {
          //      matchFound = true;
          //    }
          //  }
          //  if (!matchFound) {
          //    allRecordsCorrect = false;
          //    logInColor('TXT Check: Wrong', 'Wrong');
          //  } else {
          //    logInColor('TXT Check: Correct', 'Correct');
          //  }
          // }
        }
        catch (err) {
          allRecordsCorrect = false;
          console.log('Error at querying TXT records');
        }
        break;                   
      case 'SRV':
        try {
          logInColor('SRV Check: Skipped', 'Correct');
          //const srvRecords = await dnsPromises.resolveSrv(record.name);
          //console.log('Expected SRV:', record.data.replace(' 443', ''));
          //console.log('Actual SRV:', srvRecords[0]?.name);
          //if (!srvRecords || srvRecords[0].name != record.data.replace(' 443', '')) {
          //  allRecordsCorrect = false;
          //  logInColor('SRV Check: Wrong', 'Wrong');
          //} else {
          //  logInColor('SRV Check: Correct', 'Correct');
          //}
        }
        catch (err) {
          allRecordsCorrect = false;
          console.log('Error at querying SRV Record');
        }
        break;
    }
  }

  if (allRecordsCorrect) {
    if(domain.verification_status === 'pending') {
      const domains = db.collection(user_domain_collection);
      await domains.updateOne({ domain: domain.domain }, { $set: { verification_status: 'active' } });
      const user = await db.collection(user_collection).findOne({ user_id: domain.user_id });
    
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        </head>
        <body>
            <div style="color: #334155; padding: 20px; font-family: Arial, sans-serif;">
                <h1>Hello ${user.username},</h1>
                <p style="font-size: 1.25rem; color: #1E3A8A;">Your domain ${domain.domain} is now active! <i class="fas fa-check-circle" style="color: #10B981;"></i></p>
                <p style="font-size: 1rem; color: #1F2937;">Thank you for using Solun!</p>
                <p style="font-size: 1rem; color: #64748B;">You can now create mailboxes and aliases for this domain in the Solun Dashboard. Enjoy!</p>
                <p style="font-size: 1rem; color: #64748B;">If you need any assistance, please do not hesitate to reply to this email. We're here to help!</p>
            </div>
        </body>
        </html>    
      `;
    
      await sendMail(user.fqe, 'Your Domain is Active', htmlContent);
    }
  } else {
    console.log("### DNS Records Incorrect for Domain:", domain.domain, "###")
    const domains = db.collection(user_domain_collection);
    if(domain.verification_status === 'active') {
          const user = await db.collection(user_collection).findOne({ user_id: domain.user_id });
          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
            </head>
            <body>
                <div style="color: #334155; padding: 20px; font-family: Arial, sans-serif;">
                    <h1>Hello ${user.username},</h1>
                    <p style="font-size: 1.25rem; color: #1E3A8A;">Your domain ${domain.domain} no longer complies with the Solun DNS records! <i class="fas fa-exclamation-circle" style="color: #EF4444;"></i></p>
                    <p style="font-size: 1rem; color: #1F2937;">We have paused it in your Solun account. To re-add it, please go to the dashboard and enter the DNS entries stored there.</p>
                    <p style="font-size: 1rem; color: #64748B;">It will be removed automatically after a few days, along with all your mailboxes and data - but we will warn you again before that happens.</p>
                    <p style="font-size: 1rem; color: #64748B;">If you need any assistance, please do not hesitate to reply to this email. We're here to help!</p>
                </div>
            </body>
            </html>
          `;

          await sendMail(user.fqe, 'Your Domain is Inactive', htmlContent);
    }
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
        $in: ['pending', 'active']
      }
    }).sort({ verification_status: -1 });    

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
          'authorization': process.env.API_KEY
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
      
      if (await cursor.hasNext()) {
        console.log('----------------------------------------');
        console.log('Waiting for next Domain...');
        console.log('----------------------------------------');
        await sleep(120000); // 2 minutes
      }
    }
  } finally {
    console.log("### Script End @", new Date(), "###");
    if (client) {
      await client.close();
    }
  }
}

console.log("### Solun Check DNS ###");
console.log("### Script Start @", new Date(), "###");
run().catch(console.dir);

setInterval(async () => {
  console.log("### Script Restart @", new Date(), "###");
  await run().catch(console.dir);
}, 15 * 60 * 1000); // 15 minutes
