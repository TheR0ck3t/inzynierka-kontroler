
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
    }
});

client.on('error', (error) => {
    logger.error(`Błąd MQTT: ${error.message}`);
});

function subscribeToTopics() {
    const topics = ['rfid/command', 'rfid/scan', 'rfid/secret_update'];
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

function registerHandler(topic, handler) {
    messageHandlers.set(topic, handler);
}

function publish(topic, payload, callback) {
    const payloadStr = JSON.stringify(payload);
    client.publish(topic, payloadStr, (err) => {
        if (err) {
            logger.error(`Błąd publikacji na ${topic}: ${err.message}`);
        } else {
            logger.info(`Publikowano wiadomość na ${topic}: ${payloadStr}`);
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
