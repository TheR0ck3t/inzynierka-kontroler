const fs = require('fs');
const path = require('path');
const logger = require('./logger'); // Przyjmujemy, że masz skonfigurowany logger

// Funkcja do rekurencyjnego ładowania plików z folderu
const loadServices = (dirPath) => {
    fs.readdirSync(dirPath).forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            loadServices(fullPath); // Rekurencja dla folderów
        } else {
            const service = require(fullPath);
            if (service && service.initialize) {
                service.initialize(); // Uruchamiamy odpowiednią funkcję z pliku serwisowego
                // logger.info(`Service loaded and initialized from: ${fullPath}`);
                console.log(`Service loaded and initialized from: ${fullPath}`);
            }
        }
    });
};

// Ładowanie i inicjalizacja usług
const servicesPath = path.join(__dirname, './src/services'); // Ścieżka do folderu serwisów
loadServices(servicesPath);

// Dodatkowe opcje, jeśli chcesz dodać więcej logiki
// logger.info('Kontroler uruchomiony');
console.log('Kontroler uruchomiony');