// HomePage.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Card, ListGroup, Button } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import { Link } from "react-router-dom"; // Importiere Link für die Navigation

const HomePage = () => {
  const [events, setEvents] = useState([]);

  // Hole alle Events, die heute stattfinden
  useEffect(() => {
    fetchDailyTasks();
  }, []);

  // Funktion, um alle Events zu holen und die täglichen zu filtern
  const fetchDailyTasks = () => {
    axios
      .get("http://localhost:5000/api/events") // Hole alle Events
      .then((response) => {
        const today = new Date();
        const filteredEvents = response.data.filter((event) => {
          const eventDate = new Date(event.start);
          // Nur Events, die am heutigen Tag stattfinden
          return (
            eventDate.getDate() === today.getDate() &&
            eventDate.getMonth() === today.getMonth() &&
            eventDate.getFullYear() === today.getFullYear()
          );
        });
        setEvents(filteredEvents);
      })
      .catch((err) => {
        console.error("Error loading events:", err);
      });
  };

  // Funktion zum formatieren der Uhrzeit
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="container mt-4">
      <h2>Today's Tasks</h2>
      <div className="row">
        {events.length === 0 ? (
          <div className="col-12">
            <h4>No tasks for today!</h4>
          </div>
        ) : (
          events.map((event) => (
            <div className="col-md-4 mb-4" key={event.id}>
              <Card>
                <Card.Body>
                  <Card.Title>{event.title}</Card.Title>
                  <ListGroup variant="flush">
                    <ListGroup.Item>
                      <strong>Start: </strong>{formatTime(event.start)}
                    </ListGroup.Item>
                    <ListGroup.Item>
                      <strong>End: </strong>{formatTime(event.end)}
                    </ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Status: </strong>
                      <span
                        style={{
                          color: event.isCompleted ? "green" : "red",
                        }}
                      >
                        {event.isCompleted ? "Completed" : "Pending"}
                      </span>
                    </ListGroup.Item>
                  </ListGroup>
                </Card.Body>
              </Card>
            </div>
          ))
        )}
      </div>
      {/* Button zum Navigieren zum Kalender */}
      <div className="text-center mt-4">
        <Link to="/calendar">
          <Button variant="primary">Go to Calendar</Button>
        </Link>
      </div>
    </div>
  );
};

export default HomePage;
