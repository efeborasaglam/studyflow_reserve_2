// Calendar.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import Fullcalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Modal, Button, Form } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import { Link } from "react-router-dom"; // Importiere Link für die Navigation

function Calendar() {
  const [events, setEvents] = useState([]);
  const [modalData, setModalData] = useState({
    show: false,
    start: null,
    end: null,
    isEdit: false,
    event: null,
  });
  const [isExam, setIsExam] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
  };

  const fetchEvents = () => {
    axios
      .get("http://localhost:5000/api/events")
      .then((response) => {
        const formattedEvents = response.data.map((event) => ({
          ...event,
          id: event._id.toString(),
          backgroundColor: event.isExam
            ? "red"
            : event.isCompleted
            ? "green"
            : event.backgroundColor || "blue",
        }));
        setEvents(formattedEvents);
      })
      .catch((err) => console.error("Error loading events:", err));
  };

  const handleDateClick = (info) => {
    setModalData({
      show: true,
      start: formatDateTime(info.dateStr),
      end: "",
      isEdit: false,
      event: null,
    });
    setIsExam(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("icsFile", file);

    try {
      await axios.post("http://localhost:5000/api/upload-ics", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fetchEvents(); // Aktualisieren Sie die Events nach dem Hochladen
    } catch (err) {
      console.error("Error uploading ICS file:", err);
      alert("Failed to upload ICS file.");
    }
  };

  const handleSaveEvent = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const title = formData.get("title");
    const start = formData.get("start");
    let end = formData.get("end");
    const daysBefore = isExam ? parseInt(formData.get("daysBefore"), 10) : 0;
    const studyDuration = isExam ? parseInt(formData.get("studyDuration"), 10) : 0;
    const studyEventColor = formData.get("studyEventColor"); // Farbe aus dem Formular holen
  
    // Wenn kein Endzeitpunkt angegeben, setze einen Standard-Endzeitpunkt (1 Stunde nach Start)
    if (!end) {
      end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
    }
  
    // Wenn es sich um einen Test handelt, hole die Importance
    const importance = isExam ? parseInt(formData.get("importance"), 10) : null;
  
    const eventData = {
      title,
      start,
      end,
      isExam,
      studyEventColor, // Farbe für die Study-Events hinzufügen
      ...(isExam ? { importance, backgroundColor: "red" } : {}),
    };
  
    const axiosMethod = modalData.isEdit ? axios.put : axios.post;
    const url = modalData.isEdit
      ? `http://localhost:5000/api/events/${modalData.event.id}`
      : "http://localhost:5000/api/events";
  
    axiosMethod(url, eventData)
      .then((response) => {
        // Wenn es sich um einen Test handelt, generiere Study-Events mit der Farbe
        if (isExam) {
          generateStudyEvents(
            response.data,
            importance,
            daysBefore,
            studyDuration,
            studyEventColor  // Farbe hier übergeben
          );
        }
        fetchEvents();
        handleModalClose();
      })
      .catch((err) => {
        if (err.response && err.response.data && err.response.data.error) {
          alert(err.response.data.error); // Zeige die Fehlermeldung an
        } else {
          console.error("Error saving event:", err);
        }
      });
  };
  

  const generateStudyEvents = (exam, importance, daysBefore, studyDuration, studyEventColor) => {
    const studyEvents = [];
    
    // Bestimme, wie oft pro Woche gelernt werden soll
    let studyInterval;
    if (importance >= 1 && importance <= 20) {
      studyInterval = 3;  // Alle 3 Tage lernen
    } else if (importance >= 21 && importance <= 50) {
      studyInterval = 2;  // Alle 2 Tage lernen
    } else if (importance >= 51 && importance <= 100) {
      studyInterval = 1;  // Jeden Tag lernen
    }
  
    const examStart = new Date(exam.start);
  
    // Hole alle bestehenden Events aus der Datenbank oder dem Backend
    axios.get("http://localhost:5000/api/events")
      .then(response => {
        const existingEvents = response.data.map(event => ({
          start: new Date(event.start),
          end: new Date(event.end),
        }));
  
        // Generiere Study-Events für die Tage vor der Prüfung
        for (let i = 0; i < daysBefore; i++) {
          let studyEventDate = new Date(examStart);
          studyEventDate.setDate(examStart.getDate() - i);  // Verschiebe den Starttag um i Tage
  
          // Wenn das Lernintervall erfüllt ist (z.B. alle 2 Tage oder 3 Tage)
          if (i % studyInterval === 0) {
            // Hole alle freien Zeiträume an diesem Tag
            const freePeriods = getFreePeriods(studyEventDate, existingEvents, studyDuration);
  
            // Wenn genügend freie Zeiträume gefunden wurden, erstelle die Study-Events
            freePeriods.forEach(period => {
              const studyEventStart = new Date(period.start);
  
              // Überprüfe, ob die Study-Event-Zeit innerhalb des zulässigen Zeitraums liegt (zwischen 17:00 und 21:00)
              if (studyEventStart.getHours() >= 17 && studyEventStart.getHours() < 21) {
                // Stelle sicher, dass die Study-Events nicht nach der Prüfung stattfinden
                if (studyEventStart < examStart) {  // Study-Event muss vor der Prüfung liegen
                  studyEvents.push({
                    title: `Study for ${exam.title}`,
                    start: period.start.toISOString(),
                    end: period.end.toISOString(),
                    backgroundColor: studyEventColor,  // Hier wird die Farbe verwendet
                    relatedExamId: exam.id, // Verlinkung mit der Prüfung
                  });
                }
              }
            });
          }
        }
  
        // Sende die Study-Events an das Backend
        if (studyEvents.length > 0) {
          axios.post("http://localhost:5000/api/events/bulk", studyEvents)
            .then(() => {
              console.log("Study events successfully created.");
            })
            .catch((err) => console.error("Error creating study events:", err));
        } else {
          console.log("No study events were created due to lack of available time slots.");
        }
      })
      .catch((err) => console.error("Error fetching existing events:", err));
  };
  
  
  
  // Hilfsfunktion zum Finden freier Zeiträume an einem bestimmten Tag
  const getFreePeriods = (day, existingEvents, studyDuration) => {
    const freePeriods = [];
    const dayStart = new Date(day.setHours(0, 0, 0, 0)); // Beginn des Tages
    const dayEnd = new Date(day.setHours(23, 59, 59, 999)); // Ende des Tages

    // Finde alle freien Zeiträume
    let lastEndTime = dayStart;

    existingEvents.forEach((event) => {
      // Wenn das Event am selben Tag stattfindet und es eine Lücke zwischen den Events gibt
      if (event.start >= dayStart && event.start <= dayEnd) {
        if (event.start > lastEndTime) {
          // Es gibt eine Lücke zwischen den Events
          let gapStart = lastEndTime;
          let gapEnd = new Date(gapStart.getTime() + studyDuration * 60000); // Dauer des Study-Events

          if (gapEnd <= event.start) {
            // Füge die freie Zeitspanne hinzu, wenn sie genügend lang ist
            freePeriods.push({ start: gapStart, end: gapEnd });
          }
        }
        // Setze die letzte Endzeit auf das Ende des aktuellen Events
        lastEndTime = event.end > lastEndTime ? event.end : lastEndTime;
      }
    });

    // Falls nach dem letzten Event noch Zeit bleibt, füge auch das hinzu
    if (lastEndTime < dayEnd) {
      let gapStart = lastEndTime;
      let gapEnd = new Date(gapStart.getTime() + studyDuration * 60000);
      if (gapEnd <= dayEnd) {
        freePeriods.push({ start: gapStart, end: gapEnd });
      }
    }

    return freePeriods;
  };

  const toggleEventCompletion = (eventId) => {
    axios
      .put(`http://localhost:5000/api/events/toggle-completed/${eventId}`)
      .then(() => {
        fetchEvents(); // Aktualisiere die Event-Daten
        handleModalClose(); // Schließe das Modal
      })
      .catch((err) => console.error("Error toggling event completion:", err));
  };

  const handleModalClose = () => {
    setModalData({
      show: false,
      start: null,
      end: null,
      isEdit: false,
      event: null,
    });
    setIsExam(false);
  };

  const handleDeleteEvent = () => {
    if (modalData.event) {
      axios
        .delete(`http://localhost:5000/api/events/${modalData.event.id}`)
        .then(() => {
          if (modalData.event.isExam) {
            axios
              .delete(
                `http://localhost:5000/api/events/related/${modalData.event.id}`
              )
              .then(fetchEvents);
          }
          fetchEvents();
          handleModalClose();
        })
        .catch((err) => console.error("Error deleting event:", err));
    }
  };

  return (
    <div>
      <Link to="/">
        <Button variant="secondary">Back to Home</Button>
      </Link>
      <div style={{ marginBottom: "20px" }}>
        <Form.Group>
          <Form.Label>Upload ICS File</Form.Label>
          <Form.Control type="file" accept=".ics" onChange={handleFileUpload} />
        </Form.Group>
      </div>
      <Fullcalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={"dayGridMonth"}
        headerToolbar={{
          start: "today prev,next",
          center: "title",
          end: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        height={"90vh"}
        events={events}
        dateClick={handleDateClick}
        eventClick={(info) => {
          setModalData({
            show: true,
            start: formatDateTime(info.event.start),
            end: formatDateTime(info.event.end),
            isEdit: true,
            event: events.find((event) => event.id === info.event.id),
          });
        }}
        editable={true}
        firstDay={1}
      />
      <Modal show={modalData.show} onHide={handleModalClose}>
        <Form onSubmit={handleSaveEvent}>
          <Modal.Header closeButton>
            <Modal.Title>
              {modalData.isEdit ? "Edit Event" : "Add Event"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Title</Form.Label>
              <Form.Control
                name="title"
                defaultValue={modalData.isEdit ? modalData.event.title : ""}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Start</Form.Label>
              <Form.Control
                type="datetime-local"
                name="start"
                defaultValue={
                  modalData.isEdit
                    ? formatDateTime(modalData.event.start)
                    : modalData.start
                }
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>End</Form.Label>
              <Form.Control
                type="datetime-local"
                name="end"
                defaultValue={
                  modalData.isEdit ? formatDateTime(modalData.event.end) : ""
                }
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Is this an exam?"
                onChange={(e) => setIsExam(e.target.checked)}
              />
            </Form.Group>

            {isExam && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>Importance (1-100)</Form.Label>
                  <Form.Control
                    type="number"
                    name="importance"
                    min="1"
                    max="100"
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Days before the exam to study</Form.Label>
                  <Form.Control
                    type="number"
                    name="daysBefore"
                    min="1"
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Study duration (in minutes)</Form.Label>
                  <Form.Control
                    type="number"
                    name="studyDuration"
                    min="15"
                    required
                  />
                </Form.Group>

                {/* Neues Feld für die Farbauswahl */}
                <Form.Group className="mb-3">
                  <Form.Label>Study Event Color</Form.Label>
                  <Form.Control
                    type="color"
                    name="studyEventColor"
                    defaultValue="#0000ff" // Standardfarbe (blau)
                  />
                </Form.Group>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            {modalData.event && (
              <Button
                variant={modalData.event.isCompleted ? "warning" : "success"}
                onClick={() => toggleEventCompletion(modalData.event.id)}
              >
                {modalData.event.isCompleted
                  ? "Mark as Incomplete"
                  : "Mark as Completed"}
              </Button>
            )}
            <Button variant="danger" onClick={handleDeleteEvent}>
              Delete
            </Button>
            <Button variant="secondary" onClick={handleModalClose}>
              Close
            </Button>
            <Button variant="primary" type="submit">
              Save
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default Calendar;
