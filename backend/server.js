// server.js
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const mongoURI =
  "mongodb+srv://efeborasaglam:Efe05St_Gallen@restfullapi.tex7t7x.mongodb.net/studyflow?retryWrites=true&w=majority";
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  start: { type: String, required: true },
  end: { type: String },
  backgroundColor: { type: String, default: "blue" },
  isCompleted: { type: Boolean, default: false },
});

eventSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

const Event = mongoose.model("Event", eventSchema);

app.get("/api/events", async (req, res) => {
  try {
    const events = await Event.find();
    res.json(events);
  } catch (err) {
    res.status(500).send("Error retrieving events");
  }
});

// POST-Endpunkt zum Erstellen eines Events
app.post('/api/events', async (req, res) => {
  try {
    const { start, end, isExam } = req.body;

    // Wenn kein Endzeitpunkt angegeben ist, füge 1 Stunde zum Startzeitpunkt hinzu
    let eventEnd = end;
    if (!eventEnd) {
      eventEnd = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(); // 1 Stunde nach Start
    }

    // Überprüfen, ob ein Event oder eine Prüfung bereits im gleichen Zeitraum existiert
    const conflictingEvent = await Event.findOne({
      $or: [
        { start: { $lte: eventEnd }, end: { $gte: start } }, // Start- und Endzeitraum überprüfen
      ],
    });

    if (conflictingEvent) {
      return res.status(400).json({ error: 'Es gibt bereits ein Event oder eine Prüfung zur gleichen Zeit.' });
    }

    const newEvent = new Event(req.body);
    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating event');
  }
});

// PUT-Endpunkt zum Bearbeiten eines Events
app.put('/api/events/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const updatedEvent = req.body;

    // Wenn kein Endzeitpunkt angegeben ist, füge 1 Stunde zum Startzeitpunkt hinzu
    if (!updatedEvent.end) {
      updatedEvent.end = new Date(new Date(updatedEvent.start).getTime() + 60 * 60 * 1000).toISOString(); // 1 Stunde nach Start
    }

    // Überprüfen, ob das bearbeitete Event mit anderen Events kollidiert
    const conflictingEvent = await Event.findOne({
      _id: { $ne: eventId }, // Ausschluss des bearbeiteten Events
      $or: [
        { start: { $lte: updatedEvent.end }, end: { $gte: updatedEvent.start } },
      ],
    });

    if (conflictingEvent) {
      return res.status(400).json({ error: 'Es gibt bereits ein Event oder eine Prüfung zur gleichen Zeit.' });
    }

    const event = await Event.findByIdAndUpdate(eventId, updatedEvent, { new: true });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating event');
  }
});




app.delete("/api/events/:id", async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).send("Error deleting event");
  }
});

app.delete("/api/events/related/:examId", async (req, res) => {
  try {
    await Event.deleteMany({ relatedExamId: req.params.examId });
    res.status(204).send();
  } catch (err) {
    res.status(500).send("Error deleting related study events");
  }
});


app.post("/api/events/bulk", async (req, res) => {
  try {
    await Event.insertMany(req.body);
    res.status(201).send("Study events created");
  } catch (err) {
    res.status(500).send("Error creating study events");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


