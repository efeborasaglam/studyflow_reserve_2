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
    const daysBefore = isExam ? parseInt(formData.get("daysBefore"), 10) : 0;
    const studyDuration = isExam
      ? parseInt(formData.get("studyDuration"), 10)
      : 0;

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
          generateStudyEvents(
            response.data,
            importance,
            daysBefore,
            studyDuration
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

  const generateStudyEvents = (exam, importance, daysBefore, studyDuration) => {
    const studyInterval = importance <= 20 ? 3 : importance <= 50 ? 2 : 1; // Intervall in Tagen
    const studyEvents = [];

    // Berechnung der Startzeit für Lerntermine
    const checkForEventConflict = (startDate) => {
      return events.some((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        const studyEventStart = new Date(startDate);

        return studyEventStart >= eventStart && studyEventStart <= eventEnd;
      });
    };

    const examStart = new Date(exam.start);
    for (let i = 0; i < daysBefore; i += studyInterval) {
      let studyEventStart = new Date(examStart);
      studyEventStart.setDate(examStart.getDate() - i);
      studyEventStart.setHours(9, 0, 0, 0); // Standardstartzeit: 9:00 Uhr

      let studyEventEnd = new Date(studyEventStart);
      studyEventEnd.setMinutes(studyEventStart.getMinutes() + studyDuration);

      // Kollision vermeiden
      while (checkForEventConflict(studyEventStart)) {
        studyEventStart.setHours(studyEventStart.getHours() + 1);
        studyEventEnd = new Date(studyEventStart);
        studyEventEnd.setMinutes(studyEventStart.getMinutes() + studyDuration);
      }

      // Study-Event hinzufügen
      studyEvents.push({
        title: `Study for ${exam.title}`,
        start: studyEventStart.toISOString(),
        end: studyEventEnd.toISOString(),
        backgroundColor: "blue",
      });
    }

    if (studyEvents.length > 0) {
      axios
        .post("http://localhost:5000/api/events/bulk", studyEvents)
        .then(() => {
          console.log("Study events successfully created.");
          fetchEvents();
        })
        .catch((err) => console.error("Error generating study events:", err));
    }
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
