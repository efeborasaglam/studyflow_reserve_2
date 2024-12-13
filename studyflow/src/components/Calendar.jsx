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

  const handleSaveEvent = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const title = formData.get("title");
    const start = formData.get("start");
    let end = formData.get("end");
  
    // Wenn kein Endzeitpunkt angegeben, setze einen Standard-Endzeitpunkt (1 Stunde nach Start)
    if (!end) {
      end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(); // 1 Stunde nach Start
    }
  
    // Wenn es sich um einen Test handelt, hole die Importance
    const importance = isExam ? formData.get("importance") : null;
  
    const eventData = {
      title,
      start,
      end,
      isExam,
      ...(isExam ? { importance, backgroundColor: "red" } : {}),
    };
  
    const axiosMethod = modalData.isEdit ? axios.put : axios.post;
    const url = modalData.isEdit
      ? `http://localhost:5000/api/events/${modalData.event.id}`
      : "http://localhost:5000/api/events";
  
    axiosMethod(url, eventData)
      .then((response) => {
        // Wenn es sich um einen Test handelt, generiere Study-Events
        if (isExam) {
          generateStudyEvents(response.data, importance);
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
  
  
  const generateStudyEvents = (exam, importance) => {
    const daysToExam = Math.ceil((new Date(exam.start) - new Date()) / (1000 * 60 * 60 * 24)); // Berechne die Tage bis zur Prüfung
    const studyEvents = [];
  
    // Überprüfen, ob zu einem bestimmten Zeitpunkt bereits ein anderes Event existiert
    const checkForEventConflict = (startDate) => {
      return events.some(event => {
        // Wenn das Startdatum des Events mit dem der Study-Events überlappt, gibt es einen Konflikt
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        const studyEventStart = new Date(startDate);
  
        return studyEventStart >= eventStart && studyEventStart <= eventEnd;
      });
    };
  
    // Die Events generieren
    for (let i = 1; i <= daysToExam; i++) {
      if (i % Math.ceil(100 / importance) === 0) {
        let studyEventStart = new Date(new Date().setDate(new Date().getDate() + i));
        let studyEventEnd = new Date(new Date(studyEventStart).setHours(studyEventStart.getHours() + 1)); // 1 Stunde für das Study-Event
  
        // Solange es eine Kollision gibt, verschiebe das Study-Event auf den nächsten freien Zeitpunkt am selben Tag
        while (checkForEventConflict(studyEventStart)) {
          // Wenn es zu einer Kollision kommt, versuche das Study-Event eine Stunde nach hinten zu verschieben
          studyEventStart = new Date(studyEventStart.setHours(studyEventStart.getHours() + 1));
          studyEventEnd = new Date(new Date(studyEventStart).setHours(studyEventStart.getHours() + 1)); // Update Endzeit
        }
  
        // Study-Event erstellen
        studyEvents.push({
          title: `Study for ${exam.title}`,
          start: studyEventStart.toISOString(),
          end: studyEventEnd.toISOString(),
          backgroundColor: "blue", // Die Farbe der Study-Events
        });
      }
    }
  
    if (studyEvents.length > 0) {
      // Die Study-Events in die Datenbank posten
      axios.post("http://localhost:5000/api/events/bulk", studyEvents)
        .then(() => {
          console.log("Study events successfully created.");
          fetchEvents(); // Events nach dem Erstellen der Study-Events erneut laden
        })
        .catch((err) => {
          console.error("Error generating study events:", err);
        });
    }
  };
  
  
  
  const updateStudyEvents = (exam) => {
    axios
      .get(`http://localhost:5000/api/events/related/${exam.id}`)
      .then((response) => {
        const studyEvents = response.data;
        const updatedEvents = studyEvents.map((event) => ({
          ...event,
          title: `Study for ${exam.title}`,
        }));

        axios
          .put("http://localhost:5000/api/events/bulk", updatedEvents)
          .then(fetchEvents)
          .catch((err) => console.error("Error updating study events:", err));
      })
      .catch((err) => console.error("Error fetching related events:", err));
  };

  const handleModalClose = () => {
    setModalData({ show: false, start: null, end: null, isEdit: false, event: null });
    setIsExam(false);
  };

  const handleDeleteEvent = () => {
    if (modalData.event) {
      axios
        .delete(`http://localhost:5000/api/events/${modalData.event.id}`)
        .then(() => {
          if (modalData.event.isExam) {
            axios
              .delete(`http://localhost:5000/api/events/related/${modalData.event.id}`)
              .then(fetchEvents);
          }
          fetchEvents();
          handleModalClose();
        })
        .catch((err) => console.error("Error deleting event:", err));
    }
  };

  const toggleEventCompletion = (eventId) => {
    const updatedEvent = events.find((event) => event.id === eventId);
    if (updatedEvent) {
      updatedEvent.isCompleted = !updatedEvent.isCompleted;
      updatedEvent.backgroundColor = updatedEvent.isCompleted ? "green" : updatedEvent.isExam ? "red" : "blue";

      axios
        .put(`http://localhost:5000/api/events/${eventId}`, updatedEvent)
        .then(fetchEvents)
        .catch((err) => console.error("Error updating completion:", err));
    }
  };

  return (
    <div>
        <Link to="/">
          <Button variant="secondary">Back to Home</Button>
        </Link>
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
          toggleEventCompletion(info.event.id); // Als erledigt markieren
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
            <Modal.Title>{modalData.isEdit ? "Edit Event" : "Add Event"}</Modal.Title>
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
                defaultValue={modalData.isEdit ? formatDateTime(modalData.event.start) : modalData.start}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>End</Form.Label>
              <Form.Control
                type="datetime-local"
                name="end"
                defaultValue={modalData.isEdit ? formatDateTime(modalData.event.end) : ""}
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
            <Form.Group className="mb-3">
              <Form.Label>Importance (1-100)</Form.Label>
              <Form.Control type="number" name="importance" min="1" max="100" required />
            </Form.Group>
          )}
          </Modal.Body>
          <Modal.Footer>
            {modalData.isEdit && (
              <Button
                variant="success"
                onClick={() => {
                  toggleEventCompletion(modalData.event.id);
                  handleModalClose();
                }}
              >
                Mark as Completed
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
