# 🏥 HealthAI — AI-Powered Medical Report Analyzer

> Medical reports upload karein — AI sab kuch samjha dega. Kya normal hai, kya nahi, kaunsa doctor milein, kya khaein.

![HealthAI Banner](https://img.shields.io/badge/HealthAI-AI%20Powered-00e5ff?style=for-the-badge&logo=heart)
![Python](https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green?style=for-the-badge)
![Ollama](https://img.shields.io/badge/Ollama-LLM-purple?style=for-the-badge)

---

## ✨ Features

| Feature | Description |
|---|---|
| 📄 PDF Upload | Medical reports ko PDF mein upload karein |
| 🤖 AI Analysis | Ollama LLM se deep health analysis |
| ✅ Normal Values | Kya kya normal range mein hai |
| ⚠️ Abnormal Values | Kya kya abnormal hai, kitna concern hai |
| 🔴 Health Problems | Detected problems severity ke saath |
| 🥗 Diet Advice | Kya khaein, kya nahi khaein |
| 💊 Treatment | Suggested treatments urgency ke saath |
| 🏥 Doctor Match | Report ke basis pe relevant doctors suggest |
| 📞 Doctor Contact | Phone numbers with specializations |

---

## 🛠️ Tech Stack

**Frontend:**
- Pure HTML5, CSS3, Vanilla JavaScript
- Google Fonts (Syne + DM Sans)
- Responsive design, dark theme

**Backend:**
- Python 3.10+
- FastAPI (REST API)
- Ollama (Local LLM)
- pdfplumber (PDF text extraction)
- httpx (async HTTP)

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.10+
- [Ollama](https://ollama.ai) installed
- Node.js (optional, for live-server)

---

### Step 1: Ollama Setup

```bash
# Ollama download karein: https://ollama.ai

# Ollama server start karein
ollama serve

# Model download karein (ek bar karna hai)
ollama pull llama3
# Ya koi bhi model:
# ollama pull mistral
# ollama pull llama3.2
```

---

### Step 2: Backend Setup

```bash
# Project folder mein jaein
cd healthai/backend

# Virtual environment banain (recommended)
python -m venv venv
source venv/bin/activate   # Linux/Mac
# Ya: venv\Scripts\activate  # Windows

# Dependencies install karein
pip install -r requirements.txt

# Server start karein
python main.py
# Ya: uvicorn main:app --reload --port 8000
```

Backend `http://localhost:8000` pe chalega.

---

### Step 3: Frontend Open Karein

**Option A — Simple:**
```bash
# frontend folder mein jaein
cd healthai/frontend

# Direct browser mein open karein
open index.html
# Ya: double click karein index.html
```

**Option B — Live Server (better):**
```bash
# Node.js se
npm install -g live-server
live-server frontend/
```

Frontend `http://localhost:8080` pe milega.

---

### Step 4: Model Change Karein (Optional)

`backend/main.py` mein yeh line dhundein:
```python
OLLAMA_MODEL = "llama3"  # Yahan apna model name daalein
```

---

## 📁 Project Structure

```
healthai/
├── frontend/
│   ├── index.html          # Main UI page
│   ├── style.css           # Styling (dark theme)
│   └── app.js              # Frontend logic
│
├── backend/
│   ├── main.py             # FastAPI server + Ollama integration
│   └── requirements.txt    # Python dependencies
│
├── .gitignore
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | API status check |
| GET | `/health` | Ollama connection check |
| POST | `/analyze-report` | PDF upload & analysis |
| GET | `/doctors` | Saare doctors list |

---

## ⚠️ Disclaimer

> **Yeh tool sirf educational aur informational purposes ke liye hai.**
> Kisi bhi treatment, diagnosis, ya health decision ke liye qualified doctor se zaroor milein.
> AI analysis 100% accurate nahi ho sakti — professional medical advice replace nahi kar sakti.

---

## 🤝 Contributing

Pull requests welcome hain! Issues report karein ya features suggest karein.

---

## 📄 License

MIT License — Free to use and modify.

---

Made with ❤️ for better health awareness in India 🇮🇳
