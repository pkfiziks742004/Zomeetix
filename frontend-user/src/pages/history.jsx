import React, { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { Button, Snackbar } from '@mui/material';
import withAuth from '../utils/withAuth';
import AppShell from '../components/AppShell';
import "../App.css";

function History() {
    const { getHistoryOfUser, addToUserHistory, validateMeetingAccess } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([])
    const [error, setError] = useState("");

    const routeTo = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser();
                setMeetings(history);
            } catch (e) {
                setError(e?.response?.data?.message || "Unable to load history.");
            }
        }

        fetchHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear();

        return `${day}/${month}/${year}`
    }

    const rejoinMeeting = async (meetingCode) => {
        try {
            const password = window.prompt(`Enter password for meeting ${meetingCode}`);
            if (!password) {
                return;
            }
            await validateMeetingAccess(meetingCode, password);
            await addToUserHistory(meetingCode);
            routeTo(`/meeting/${meetingCode}?password=${encodeURIComponent(password)}`);
        } catch (e) {
            setError(e?.response?.data?.message || "Unable to join meeting.");
        }
    };

    return (
        <AppShell>
            <div className="meetingFlowCard meetingFlowCardWideLayout">
                <p className="meetingModeOverline">Activity</p>
                <h2>Meeting History</h2>
                <p>Rejoin your previous meetings quickly.</p>

                <div className="historyList">
                    {
                        (meetings.length !== 0) ? meetings.map((meeting) => {
                            return (
                                <Card key={meeting._id || meeting.meetingCode} variant="outlined" className="historyCard">
                                    <CardContent>
                                        <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
                                            Code: {meeting.meetingCode}
                                        </Typography>

                                        <Typography sx={{ mb: 1.5 }} color="text.secondary">
                                            Date: {formatDate(meeting.date)}
                                        </Typography>

                                        <Button variant="contained" onClick={() => rejoinMeeting(meeting.meetingCode)}>
                                            Rejoin
                                        </Button>
                                    </CardContent>
                                </Card>
                            )
                        }) : <p className="historyEmpty">No meeting history found.</p>
                    }
                </div>
            </div>

            <Snackbar
                open={Boolean(error)}
                autoHideDuration={3000}
                onClose={() => setError("")}
                message={error}
            />
        </AppShell>
    )
}

export default withAuth(History)
