const express = require('express');
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(__dirname)); // Serve static files

const routes = ["Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6"];

// ✅ Serve climbers from CSV and routes from array
app.get('/data', (req, res) => {
  try {
    const csvPath = path.join(__dirname, 'climbers.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const records = csvParse.parse(fileContent, { skip_empty_lines: true });
    const climbers = records.map(row => row[0].trim());
    res.json({ climbers, routes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error reading climbers.csv' });
  }
});

// ✅ Handle result submissions
app.post('/submit', (req, res) => {
  const { climber, route, attempts } = req.body;

  if (!climber || !route || !Array.isArray(attempts)) {
    return res.status(400).send('Missing or invalid fields');
  }

  let zoneAchieved = false;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    if (a.top && !a.zone && !zoneAchieved) {
      return res.status(400).send(`Invalid attempt sequence: Top achieved on attempt ${a.number} before any zone was recorded.`);
    }
    if (a.zone) zoneAchieved = true;
  }

  const resultPath = path.join(__dirname, 'result.csv');

  if (fs.existsSync(resultPath)) {
    const fileContent = fs.readFileSync(resultPath, 'utf8');
    const records = csvParse.parse(fileContent, { columns: true, skip_empty_lines: true });

    const alreadySubmitted = records.find(r =>
      r.Climber === climber && r.Route === route
    );

    if (alreadySubmitted) {
      return res.status(400).json({ error: 'Result already submitted for this climber and route.' });
    }
  } else {
    fs.writeFileSync(resultPath, 'Timestamp,Climber,Route,TotalAttempts,ZonesAchieved,TopAchieved,FirstZoneAttempt,FirstTopAttempt\n');
  }

  const totalAttempts = attempts.length;
  const zoneAchievedFlag = attempts.some(a => a.zone);
  const topAchievedFlag = attempts.some(a => a.top);
  const firstZoneAttempt = attempts.findIndex(a => a.zone) + 1 || '';
  const firstTopAttempt = attempts.findIndex(a => a.top) + 1 || '';

  const line = `${new Date().toISOString()},${climber},${route},${totalAttempts},${zoneAchievedFlag},${topAchievedFlag},${firstZoneAttempt},${firstTopAttempt}\n`;
  fs.appendFile(resultPath, line, (err) => {
    if (err) {
      console.error('Error writing result.csv', err);
      return res.status(500).send('Server error');
    }

    io.emit('newResult', {
      climber,
      route,
      totalAttempts,
      zoneAchieved: zoneAchievedFlag,
      topAchieved: topAchievedFlag,
      firstZoneAttempt,
      firstTopAttempt,
      attempts
    });

    res.status(200).send('Saved');
  });
});

// ✅ Serve leaderboard results
app.get('/results.json', (req, res) => {
  try {
    const resultPath = path.join(__dirname, 'result.csv');
    const fileContent = fs.readFileSync(resultPath, 'utf8');
    const records = csvParse.parse(fileContent, { columns: true, skip_empty_lines: true });
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error reading result.csv' });
  }
});

app.get('/summary.json', (req, res) => {
  try {
    const resultPath = path.join(__dirname, 'result.csv');

    // If the result file doesn't exist yet, return an empty summary
    if (!fs.existsSync(resultPath)) {
      return res.json([]);
    }

    // Read and parse the result CSV
    const fileContent = fs.readFileSync(resultPath, 'utf8');
    const records = csvParse.parse(fileContent, { columns: true, skip_empty_lines: true });

    // Build a summary object: { climberName: [route1, route2, ...] }
    const summary = {};

    records.forEach(record => {
      const climber = record.Climber;
      const route = record.Route;

      if (!summary[climber]) {
        summary[climber] = [];
      }

      summary[climber].push(route);
    });

    // Convert to array format for frontend use
    const summaryArray = Object.entries(summary).map(([climber, routes]) => ({
      climber,
      routes,
      count: routes.length
    }));

    res.json(summaryArray);
  } catch (err) {
    console.error('Error generating summary:', err);
    res.status(500).json({ error: 'Error generating summary' });
  }
});

app.get('/submitted.json', (req, res) => {
  try {
    const resultPath = path.join(__dirname, 'result.csv');
    if (!fs.existsSync(resultPath)) return res.json([]);

    const fileContent = fs.readFileSync(resultPath, 'utf8');
    const records = csvParse.parse(fileContent, { columns: true, skip_empty_lines: true });

    const submitted = records.map(r => ({
      climber: r.Climber,
      route: r.Route
    }));

    res.json(submitted);
  } catch (err) {
    console.error('Error reading submitted results:', err);
    res.status(500).json({ error: 'Error reading submitted results' });
  }
});


// ✅ Handle client connections
io.on('connection', socket => {
  console.log('Client connected');
});

// ✅ Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at ${PORT}`);  // http://localhost:${PORT}`);
});

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Set up multer to store uploaded file as climbers.csv
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, __dirname); // Save in root directory
  },
  filename: (req, file, cb) => {
    cb(null, 'climbers.csv'); // Overwrite existing file
  }
});

const upload = multer({ storage });

app.post('/upload-climbers', upload.single('csvFile'), (req, res) => {
  console.log('Climber list updated via upload.');
  res.send('Climber list updated successfully!');
});
