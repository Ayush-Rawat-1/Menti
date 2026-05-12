# MindEase 🌿

A memory-augmented, AI-powered mental wellness companion. MindEase provides a calm, secure space to reflect, process emotions, and find clarity using advanced Generative AI. 

## ✨ Features

* **Conversational Memory:** Powered by LangGraph, the AI remembers past context across multiple conversation threads to provide deeply personalized and continuous support.
* **Real-Time Streaming:** Responses are streamed token-by-token via Server-Sent Events (SSE) for a fluid, natural conversational experience.
* **Strict Safety Guardrails:** The LLM implementation includes robust response guardrails explicitly designed to prioritize user safety and prevent any suggestions of self-harm.
* **Secure Authentication:** Implements Google OAuth 2.0 with a secure, HttpOnly cookie-based refresh token rotation system.
* **Smart Thread Management:** Conversations are lazy-initialized to prevent empty "ghost" threads, automatically reordered by recent activity, and timestamped.
* **Beautiful UI/UX:** A calming, fully responsive interface built with React, Tailwind CSS, and custom animations.

## 🛠 Tech Stack

### Frontend
* **Framework:** React 18 with TypeScript
* **Build Tool:** Vite
* **Styling:** Tailwind CSS
* **State Management:** Zustand
* **Authentication:** `@react-oauth/google`
* **Network:** Axios & native Fetch (for SSE streams)

### Backend
* **Framework:** FastAPI (Python)
* **AI/LLM:** LangGraph & LangChain
* **Database:** PostgreSQL (with async asyncpg/SQLAlchemy)
* **Authentication:** JWT (JSON Web Tokens) with secure HttpOnly cookies

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+ recommended)
* Python (3.10+ recommended)
* PostgreSQL database
* Google Cloud Console account (for OAuth Client ID)

### 1. Clone the repository
git clone https://github.com/yourusername/mindease.git
cd mindease

### 2. Backend Setup
Navigate to the backend directory and set up your Python environment:

cd Menti-backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env

*Edit the backend `.env` file with your database URL, JWT secrets, and Google Client ID.*

Run the FastAPI development server:
fastapi dev main.py

### 3. Frontend Setup
Navigate to the frontend directory:

cd ../Menti-frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

*Edit the frontend `.env` file:*
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here

Run the Vite development server:
npm run dev

## 🔒 Security & Privacy
* **Local Development:** The refresh token cookie's `secure` flag is set to `False` for local HTTP development. Ensure this is flipped to `True` in production.
* **Stateless Auth:** Access tokens are short-lived (15 mins), while refresh tokens are securely rotated in the backend database.
* **Data Isolation:** All database queries strictly enforce user-level ownership checks before returning thread or message data.

## ⚠️ Disclaimer
MindEase is an AI-powered conversational tool designed for reflection and wellness support. It is **not** a replacement for professional medical advice, diagnosis, or therapy.