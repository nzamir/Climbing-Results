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

  let bonusAchieved = false;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    if (a.top && !a.bonus && !bonusAchieved) {
      return res.status(400).send(`Invalid attempt sequence: Top achieved on attempt ${a.number} before any bonus was recorded.`);
    }
    if (a.bonus) bonusAchieved = true;
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
    fs.writeFileSync(resultPath, 'Timestamp,Climber,Route,TotalAttempts,BonusAchieved,TopAchieved,FirstBonusAttempt,FirstTopAttempt\n');
  }

  const totalAttempts = attempts.length;
  const bonusAchievedFlag = attempts.some(a => a.bonus);
  const topAchievedFlag = attempts.some(a => a.top);
  const firstBonusAttempt = attempts.findIndex(a => a.bonus) + 1 || '';
  const firstTopAttempt = attempts.findIndex(a => a.top) + 1 || '';

  const line = `${new Date().toISOString()},${climber},${route},${totalAttempts},${bonusAchievedFlag},${topAchievedFlag},${firstBonusAttempt},${firstTopAttempt}\n`;
  fs.appendFile(resultPath, line, (err) => {
    if (err) {
      console.error('Error writing result.csv', err);
      return res.status(500).send('Server error');
    }

    io.emit('newResult', {
      climber,
      route,
      totalAttempts,
      bonusAchieved: bonusAchievedFlag,
      topAchieved: topAchievedFlag,
      firstBonusAttempt,
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
  console.log(`Server running at http://localhost:${PORT}`);
});
