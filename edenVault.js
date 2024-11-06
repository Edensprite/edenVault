//This is test 4

const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const https = require("https");
const qs = require('querystring');
const {exec} = require('child_process');

// Define paths to SSL files
const certPath = path.join(__dirname, 'ssl', 'edensmart-c1.pem');
const caPath = path.join(__dirname, 'ssl', 'edensmart-c2.pem');
const keyPath = path.join(__dirname, 'ssl', 'edensmart-key.pem');

// MQTT Connection
const mqttClient = mqtt.connect('mqtt://localhost');
const topic = 'zigbee2mqtt/#';

// SQLite Database Setup
const db = new sqlite3.Database('./history.db', (err) => {
	if (err) {
		console.error('Failed to connect to the database', err);
	} else {
		console.log('Connected to SQLite database');
		db.run(
			`CREATE TABLE IF NOT EXISTS messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				topic TEXT,
				message TEXT,
				timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
			)`
		);
	}
});

// MQTT Message Handler
mqttClient.on('connect', () => {
	console.log('Connected to MQTT broker');
	mqttClient.subscribe(topic, (err) => {
		if (err) {
			console.error('Failed to subscribe to topic', err);
		} else {
			console.log(`Subscribed to topic: ${topic}`);
		}
	});
});

mqttClient.on('message', (topic, message) => {
	const msg = message.toString();
	console.log(`Received message on topic ${topic}`);

	db.run(
		`INSERT INTO messages (topic, message) VALUES (?, ?)`,
		[topic, msg],
		(err) => {
			if (err) {
				console.error('Failed to insert message into database', err);
			} else {
				console.log('Message saved to database');
			}
		}
	);
});

// Daily Job to Send Data and Clear Local Database
cron.schedule('* * * * *', async () => {
	const updateAvailable = await checkForUpdates();
	if (updateAvailable) {
		await updateAndRestart();
	}

	console.log('Running daily task to send data and clear local database');

	db.all(`SELECT id, topic, message, strftime('%s', timestamp) AS timestamp FROM messages`, async (err, rows) => {
		if (err) {
			console.error('Failed to retrieve messages', err);
			return;
		}

		try {
			console.log(`Total rows count:`, rows.length);

			const hubInfo = { "hubIp": "192.168.1.123", "hubPort": 1883 };
			const edenVaultMessage = rows;

			await axios.post(
				`https://partners.edensmart.co.uk:9984/API.php?rtype=admin.IOT&act=updateAccountWithEdenVaultMessage&userId=11&writeToken=MQKJbXoFaiAMS2eKxck20nFwLgfQiM2q`,
				qs.stringify({ edenVaultMessage: JSON.stringify(rows), hubInfo: JSON.stringify(hubInfo) }),
				{
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					httpsAgent: new https.Agent({
						cert: fs.readFileSync(certPath),
						ca: fs.readFileSync(caPath),
						key: fs.readFileSync(keyPath),
						rejectUnauthorized: false
					})
				}
			);

			console.log('Data sent successfully');
		} catch (error) {
			console.error('Failed to send data', error);
		}
	});
});

// Close Database and MQTT Client on Exit
process.on('SIGINT', () => {
	console.log('Shutting down gracefully...');
	mqttClient.end();
	db.close((err) => {
		if (err) {
			console.error('Error closing the database', err);
		} else {
			console.log('Database connection closed');
		}
		process.exit(0);
	});
});

// Define GitHub repo details
const owner = 'Edensprite';
const repo = 'edenVault';
const branch = 'main';
const commitFilePath = path.join(__dirname, 'lastCommit.txt');

// Function to fetch the latest commit hash from GitHub
async function checkForUpdates() {
  try {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`);
    const latestCommit = response.data.sha;
    
    // Read last checked commit from file
    let lastCommit = '';
    if (fs.existsSync(commitFilePath)) {
      lastCommit = fs.readFileSync(commitFilePath, 'utf8');
    }

    // If the commit hash has changed, there's an update
    if (latestCommit !== lastCommit) {
      console.log('New update available, updating...');
      fs.writeFileSync(commitFilePath, latestCommit);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking for updates', error);
    return false;
  }
}

async function updateAndRestart() {
	try {
	  console.log('Pulling latest code from GitHub');
	  exec('git pull', (err, stdout, stderr) => {
		if (err) {
		  console.error('Failed to update code', err);
		  return;
		}
		console.log('Code updated successfully, restarting...');
  
		// Restart the script
		exec(`node ${__filename}`, (err) => {
		  if (err) {
			console.error('Failed to restart script', err);
		  }
		  process.exit(0); // Exit old process
		});
	  });
	} catch (error) {
	  console.error('Error updating and restarting', error);
	}
  }
  