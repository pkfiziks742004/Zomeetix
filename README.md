# Zomeetix
# Zomeetix

Zomeetix is a full-stack meeting scheduling and management platform designed to simplify online appointment booking, meeting organization, and user management. The platform provides separate interfaces for users and administrators, ensuring an efficient and secure experience.

## Features

### User Features

* User Registration & Login
* Secure Authentication
* Profile Management
* Schedule Meetings
* View Upcoming Meetings
* Password Reset Functionality
* Responsive User Interface

### Admin Features

* Admin Dashboard
* User Management
* Meeting Monitoring
* Platform Management
* Analytics and Reporting

### Security Features

* Authentication & Authorization
* Protected Routes
* Secure Data Handling
* Session Management

## Tech Stack

### Frontend

* React.js
* JavaScript
* HTML5
* CSS3

### Backend

* Node.js
* Express.js

### Database & Backend Services

* Supabase
* PostgreSQL (via Supabase)

## Project Structure

```text
Zomeetix/
│
├── backend/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   └── config/
│
├── frontend-admin/
│   ├── src/
│   └── public/
│
├── frontend-user/
│   ├── src/
│   └── public/
│
└── README.md
```

## Installation

### Clone the Repository

```bash
git clone https://github.com/your-github-username/Zomeetix.git
cd Zomeetix
```

### Install Backend Dependencies

```bash
cd backend
npm install
npm start
```

### Install User Frontend

```bash
cd frontend-user
npm install
npm start
```

### Install Admin Frontend

```bash
cd frontend-admin
npm install
npm start
```

## Environment Variables

Create a `.env` file inside the backend directory:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
JWT_SECRET=your_jwt_secret
PORT=5000
```

## Supabase Usage

Supabase is used for:

* User Authentication
* Database Management
* Secure Data Storage
* User Profile Management
* Meeting Information Storage
* API Services

## Future Enhancements

* Video Meeting Integration
* Calendar Synchronization
* Email Notifications
* Real-Time Chat
* Meeting Reminders
* AI-Based Scheduling Assistance

## Author

Prashant Kumar

## License

This project is developed for educational and academic purposes.
