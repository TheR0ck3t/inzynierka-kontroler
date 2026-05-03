
const mqtt = require('mqtt');
const logger = require('../../logger');

const mqttConfig = {
    host: process.env.MQTT_BROKER_HOST || 'localhost',
    port: Number(process.env.MQTT_BROKER_PORT) || 1883,
    username: process.env.MQTT_CONTROLLER_USERNAME,
    password: process.env.MQTT_CONTROLLER_PASSWORD,
    clientId: `controller_${Date.now()}`,
    keepalive: 60,
    clean: false
};

if (!mqttConfig.username || !mqttConfig.password) {
    throw new Error('Brak loginu lub hasła MQTT w konfiguracji!');
}

const client = mqtt.connect(mqttConfig);
const messageHandlers = new Map();

client.on('connect', () => {
    logger.info('Połączono z brokerem MQTT');
    subscribeToTopics();
});

function subscribeToTopics() {
    const topics = ['rfid/command', 'rfid/scan', 'rfid/secret_updated', 'rfid/status'];
    topics.forEach(topic => {
        client.subscribe(topic, (err) => {
            if (err) {
                logger.error(`Błąd subskrypcji ${topic}: ${err.message}`);
            } else {
                logger.info(`Subskrybowano temat: ${topic}`);
            }
        });
    });
}


client.on('message', (topic, message) => {
    const messageStr = message.toString();
    logger.info(`Otrzymano wiadomość MQTT na ${topic}: ${messageStr}`);
    const handler = messageHandlers.get(topic);
    if (handler) {
        try {
            const data = JSON.parse(messageStr);
            handler(data);
        } catch (error) {
            logger.error(`Błąd parsowania JSON dla ${topic}: ${error.message}`);
        }
    } else {
        logger.warn(`Brak handlera dla topicu: ${topic}`);
    }
});

// Ensure secret_updated messages are forwarded to API as rotation confirmations
client.on('message', (topic, message) => {
    try {
        if (topic === 'rfid/secret_updated') {
            const payloadStr = message.toString();
            let payload;
            try {
                payload = JSON.parse(payloadStr);
            } catch (e) {
                payload = { raw: payloadStr };
            }

            // Avoid forwarding messages we've already forwarded
            if (payload.forwarded_by === 'controller') {
                return;
            }

            // Attach small marker and forward to 'rfid/rotation' with QoS=1 so backend listeners reliably receive it
            payload.forwarded_by = 'controller';
            const out = JSON.stringify(payload);
            client.publish('rfid/rotation', out, { qos: 1 }, (err) => {
                if (err) logger.error(`Failed to forward secret_updated to rfid/rotation: ${err.message}`);
                else logger.info('Forwarded secret_updated -> rfid/rotation (qos=1)');
            });
        }
    } catch (err) {
        logger.error(`Error in secret_updated forwarder: ${err.message}`);
    }
});


client.on('error', (error) => {
    logger.error(`Błąd MQTT: ${error.message}`);
});



function registerHandler(topic, handler) {
    messageHandlers.set(topic, handler);
}

function publish(topic, payload, callback) {
    const payloadStr = JSON.stringify(payload);
    client.publish(topic, payloadStr, (err) => {
        if (err) {
            logger.error(`Błąd publikacji na ${topic}: ${err.message}`);
        }
        if (callback) callback(err);
    });
}

function disconnect() {
    client.end();
    logger.info('Rozłączono z brokerem MQTT');
}

module.exports = {
    client,
    registerHandler,
    publish,
    disconnect
};
