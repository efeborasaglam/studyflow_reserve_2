// server.js
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");

const multer = require("multer");
const ical = require("node-ical");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const upload = multer({ dest: "uploads/" });

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

app.get('/api/events', (req, res) => {
  Event.find()
    .sort({ start: 1 })  // Sortiere Events nach Startzeitpunkt
    .then((events) => res.json(events))
    .catch((err) => res.status(500).json({ error: 'Failed to fetch events' }));
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

// Hilfsfunktion: Nächsten freien Zeitraum finden (für Study-Events und normale Events)
async function findNextAvailableSlot(start, durationInMinutes, ignoreEventId = null) {
  let proposedStart = new Date(start); // Startzeitpunkt für den neuen Slot
  let proposedEnd = new Date(proposedStart.getTime() + durationInMinutes * 60000);

  while (true) {
    // Finde ein Event, das im Konflikt mit dem vorgeschlagenen Zeitraum steht
    const conflictingEvent = await Event.findOne({
      _id: { $ne: ignoreEventId }, // Ignoriere das aktuelle Event bei der Kollisionserkennung
      $or: [
        { start: { $lt: proposedEnd.toISOString() }, end: { $gt: proposedStart.toISOString() } },
      ],
    }).sort({ end: 1 }); // Das früheste Konfliktende finden

    if (!conflictingEvent) {
      // Kein Konflikt gefunden, Slot ist frei
      return { start: proposedStart.toISOString(), end: proposedEnd.toISOString() };
    }

    // Konflikt besteht - neuen Startzeitpunkt nach dem Ende des Konflikts setzen
    proposedStart = new Date(conflictingEvent.end);
    proposedStart.setMinutes(proposedStart.getMinutes() + 1); // Eine Minute Pufferzeit
    proposedEnd = new Date(proposedStart.getTime() + durationInMinutes * 60000);
  }
}




// PUT-Endpunkt zum Bearbeiten eines Events
// PUT-Endpunkt zum Bearbeiten einer Prüfung und dazugehöriger Lernereignisse
// PUT-Endpunkt zum Bearbeiten einer Prüfung und dazugehöriger Lernereignisse
// PUT-Endpunkt zum Bearbeiten einer Prüfung und dazugehöriger Lernereignisse
app.put('/api/events/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const updatedEvent = req.body;

    if (!updatedEvent.end) {
      updatedEvent.end = new Date(new Date(updatedEvent.start).getTime() + 60 * 60 * 1000).toISOString(); // Standard 1 Stunde
    }

    const conflictingEvent = await Event.findOne({
      _id: { $ne: eventId },
      $or: [
        { start: { $lte: updatedEvent.end }, end: { $gte: updatedEvent.start } },
      ],
    });

    if (conflictingEvent) {
      return res.status(400).json({ error: 'Zeitkonflikt mit einem anderen Termin.' });
    }

    const event = await Event.findByIdAndUpdate(eventId, updatedEvent, { new: true });

    if (event.isExam) {
      const studyDuration = req.body.studyDuration || 60; // Dauer eines Study-Events (z. B. 60 Minuten)
      const daysBefore = req.body.daysBefore || 7; // Wie viele Tage vor der Prüfung
      const importance = req.body.importance || 50; // Wichtigkeit (zur Berechnung der Intervalle)
    
      const examStart = new Date(event.start);
      const studyInterval = importance <= 20 ? 3 : importance <= 50 ? 2 : 1; // Intervall basierend auf Wichtigkeit
    
      for (let i = 0; i < daysBefore; i += studyInterval) {
        let studyEventStart = new Date(examStart);
        studyEventStart.setDate(examStart.getDate() - i); // Tage vor der Prüfung
        studyEventStart.setHours(9, 0, 0, 0); // Standardstartzeit 9:00
    
        // Finde den nächsten konfliktfreien Zeitraum
        const { start, end } = await findNextAvailableSlot(studyEventStart.toISOString(), studyDuration, event._id);
    
        // Erstelle das Study-Event
        await Event.create({
          title: `Study for ${event.title}`,
          start,
          end,
          backgroundColor: "blue",
          relatedExamId: event._id,
        });
      }
    }    

    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Aktualisieren des Termins.');
  }
});




// Toggle event completion
app.put("/api/events/toggle-completed/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Toggle the isCompleted property
    event.isCompleted = !event.isCompleted;
    await event.save();

    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error toggling event completion");
  }
});

app.post("/api/upload-ics", upload.single("icsFile"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const parsedData = ical.parseICS(fileContent);

    const events = Object.values(parsedData)
      .filter((item) => item.type === "VEVENT")
      .map((event) => ({
        title: event.summary || "Untitled Event",
        start: event.start.toISOString(),
        end: event.end ? event.end.toISOString() : null,
        backgroundColor: "blue",
        isCompleted: false,
      }));

    await Event.insertMany(events);
    fs.unlinkSync(filePath); // Lösche die Datei nach dem Verarbeiten
    res.status(201).send("ICS file processed and events added");
  } catch (err) {
    console.error("Error processing ICS file:", err);
    res.status(500).send("Error processing ICS file");
  }
});

// DELETE-Endpunkt zum Löschen einer Prüfung und der zugehörigen Lernevents
app.delete("/api/events/:id", async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await Event.findById(eventId);

    if (event.isExam) {
      // Löschen aller verknüpften Lernereignisse
      await Event.deleteMany({ relatedExamId: eventId });
    }

    await Event.findByIdAndDelete(eventId);

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).send("Fehler beim Löschen des Termins.");
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


app.post('/api/events/bulk', (req, res) => {
  const studyEvents = req.body; // Liste der Study-Events, die erstellt werden sollen

  // Hole alle bestehenden Events
  Event.find().then((events) => {
    const eventsSorted = events.sort((a, b) => new Date(a.start) - new Date(b.start));
    
    // Hier kannst du dann prüfen, ob die geplanten Study-Events mit den bestehenden Events kollidieren
    studyEvents.forEach((studyEvent) => {
      // Überprüfe, ob das Study-Event mit bestehenden Events kollidiert
      let conflict = eventsSorted.some((existingEvent) => {
        return (
          new Date(studyEvent.start) < new Date(existingEvent.end) &&
          new Date(studyEvent.end) > new Date(existingEvent.start)
        );
      });

      if (!conflict) {
        // Wenn keine Kollision auftritt, erstelle das Study-Event
        const newStudyEvent = new Event(studyEvent);
        newStudyEvent.save();
      } else {
        console.log('Kollision mit einem bestehenden Event:', studyEvent);
      }
    });
    res.status(200).json({ message: 'Study events created successfully' });
  });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
