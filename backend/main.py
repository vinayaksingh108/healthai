from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pdfplumber
import httpx
import json
import io
import re
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="HealthAI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3"  # Change to your preferred model: llama3, mistral, etc.

DOCTORS_DB = [
    {
        "name": "Dr. Rajesh Sharma",
        "specialization": "General Physician",
        "phone": "+91-98765-43210",
        "hospital": "City Medical Center",
        "available": "Mon-Sat, 9AM-5PM",
        "keywords": ["general", "fever", "cold", "infection", "fatigue", "weakness"]
    },
    {
        "name": "Dr. Priya Mehta",
        "specialization": "Cardiologist",
        "phone": "+91-98765-11111",
        "hospital": "Heart Care Hospital",
        "available": "Mon-Fri, 10AM-6PM",
        "keywords": ["heart", "cardiac", "cholesterol", "blood pressure", "hypertension", "ecg", "triglycerides"]
    },
    {
        "name": "Dr. Anil Kumar",
        "specialization": "Endocrinologist",
        "phone": "+91-98765-22222",
        "hospital": "Hormone & Diabetes Clinic",
        "available": "Tue-Sun, 9AM-4PM",
        "keywords": ["diabetes", "sugar", "thyroid", "tsh", "t3", "t4", "hba1c", "insulin", "glucose", "hormones"]
    },
    {
        "name": "Dr. Sunita Verma",
        "specialization": "Hematologist",
        "phone": "+91-98765-33333",
        "hospital": "BloodCare Institute",
        "available": "Mon-Sat, 8AM-3PM",
        "keywords": ["blood", "hemoglobin", "anemia", "rbc", "wbc", "platelets", "cbc", "iron", "b12", "ferritin"]
    },
    {
        "name": "Dr. Vikram Singh",
        "specialization": "Nephrologist",
        "phone": "+91-98765-44444",
        "hospital": "Kidney Care Center",
        "available": "Mon-Fri, 11AM-7PM",
        "keywords": ["kidney", "creatinine", "urea", "bun", "uric acid", "gfr", "renal", "urine"]
    },
    {
        "name": "Dr. Meera Gupta",
        "specialization": "Gastroenterologist",
        "phone": "+91-98765-55555",
        "hospital": "Digestive Health Clinic",
        "available": "Mon-Sat, 10AM-5PM",
        "keywords": ["liver", "sgpt", "sgot", "alt", "ast", "bilirubin", "hepatitis", "digestion", "stomach"]
    },
    {
        "name": "Dr. Rohit Joshi",
        "specialization": "Pulmonologist",
        "phone": "+91-98765-66666",
        "hospital": "Lung & Respiratory Hospital",
        "available": "Mon-Fri, 9AM-6PM",
        "keywords": ["lung", "respiratory", "oxygen", "spo2", "chest", "breathing", "asthma", "copd"]
    },
    {
        "name": "Dr. Kavita Nair",
        "specialization": "Nutritionist & Dietitian",
        "phone": "+91-98765-77777",
        "hospital": "NutriHealth Clinic",
        "available": "Mon-Sat, 10AM-4PM",
        "keywords": ["nutrition", "diet", "vitamin", "mineral", "weight", "bmi", "deficiency"]
    },
]


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text content from PDF bytes."""
    text = ""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        raise HTTPException(status_code=400, detail=f"PDF read karne mein error: {str(e)}")
    
    if not text.strip():
        raise HTTPException(status_code=400, detail="PDF mein koi readable text nahi mila. Scanned PDF ho sakti hai.")
    
    return text


async def analyze_with_ollama(report_text: str) -> dict:
    """Send report to Ollama for analysis."""
    
    prompt = f"""You are an expert medical AI assistant. Analyze this medical/lab report carefully and provide a comprehensive health analysis.

MEDICAL REPORT:
{report_text[:4000]}

Please analyze this report and respond ONLY with a valid JSON object (no extra text, no markdown) in this EXACT format:
{{
  "summary": "Brief 2-3 sentence overview of the patient's health status in simple language",
  "overall_health_score": 75,
  "normal_values": [
    {{"parameter": "Parameter Name", "value": "Value", "normal_range": "Normal Range", "status": "Normal"}}
  ],
  "abnormal_values": [
    {{"parameter": "Parameter Name", "value": "Value", "normal_range": "Normal Range", "status": "High/Low/Critical", "concern_level": "Mild/Moderate/Severe"}}
  ],
  "health_problems": [
    {{"problem": "Problem Name", "description": "Detailed explanation in simple Hinglish/English", "severity": "Mild/Moderate/Severe", "affected_organ": "Organ/System name"}}
  ],
  "diet_recommendations": [
    {{"category": "Foods to Eat/Avoid", "items": ["item1", "item2"], "reason": "Why this helps"}}
  ],
  "treatment_suggestions": [
    {{"treatment": "Treatment Name", "description": "Details", "urgency": "Immediate/Soon/Routine"}}
  ],
  "lifestyle_changes": ["Change 1", "Change 2", "Change 3"],
  "specialist_needed": ["cardiologist", "endocrinologist"],
  "urgent_attention_required": false,
  "urgent_reason": ""
}}

Be thorough, accurate, and explain things in simple language. Base everything strictly on the report values shown."""

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "top_p": 0.9,
                    }
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail=f"Ollama server se connect nahi ho pa raha. Make sure Ollama chal raha hai: 'ollama serve'"
                )
            
            result = response.json()
            ai_response = result.get("response", "")
            
            # Clean response and parse JSON
            ai_response = ai_response.strip()
            # Remove markdown code blocks if present
            ai_response = re.sub(r'```json\s*', '', ai_response)
            ai_response = re.sub(r'```\s*', '', ai_response)
            
            # Find JSON object
            json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
            if json_match:
                analysis = json.loads(json_match.group())
                return analysis
            else:
                raise ValueError("AI response mein valid JSON nahi mila")
                
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Ollama server chal nahi raha! Terminal mein 'ollama serve' run karein aur phir try karein."
        )
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}, Response: {ai_response[:500]}")
        raise HTTPException(status_code=500, detail="AI response parse nahi ho saka. Dobara try karein.")


def match_doctors(analysis: dict) -> list:
    """Match relevant doctors based on the analysis."""
    suggested_doctors = []
    
    # Get keywords from analysis
    keywords_to_check = []
    
    specialists = analysis.get("specialist_needed", [])
    for spec in specialists:
        keywords_to_check.append(spec.lower())
    
    problems = analysis.get("health_problems", [])
    for problem in problems:
        keywords_to_check.append(problem.get("affected_organ", "").lower())
        keywords_to_check.append(problem.get("problem", "").lower())
    
    abnormal = analysis.get("abnormal_values", [])
    for val in abnormal:
        keywords_to_check.append(val.get("parameter", "").lower())
    
    keywords_str = " ".join(keywords_to_check)
    
    matched_doctors = []
    for doctor in DOCTORS_DB:
        for kw in doctor["keywords"]:
            if kw in keywords_str:
                matched_doctors.append(doctor)
                break
    
    # Always include General Physician
    general = next((d for d in DOCTORS_DB if d["specialization"] == "General Physician"), None)
    if general and general not in matched_doctors:
        matched_doctors.insert(0, general)
    
    return matched_doctors[:4]  # Max 4 doctors


@app.get("/")
async def root():
    return {"message": "HealthAI API chal raha hai! 🏥", "status": "healthy"}


@app.get("/health")
async def health_check():
    """Check if Ollama is running."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            models = response.json().get("models", [])
            model_names = [m["name"] for m in models]
            return {
                "status": "healthy",
                "ollama": "connected",
                "available_models": model_names,
                "configured_model": OLLAMA_MODEL
            }
    except:
        return {
            "status": "warning",
            "ollama": "disconnected",
            "message": "Ollama chal nahi raha. 'ollama serve' run karein."
        }


@app.post("/analyze-report")
async def analyze_report(file: UploadFile = File(...)):
    """Main endpoint to analyze medical report PDF."""
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Sirf PDF files allowed hain.")
    
    if file.size and file.size > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="File size 10MB se kam honi chahiye.")
    
    logger.info(f"Analyzing report: {file.filename}")
    
    # Read PDF
    pdf_bytes = await file.read()
    
    # Extract text
    report_text = extract_text_from_pdf(pdf_bytes)
    logger.info(f"Extracted {len(report_text)} characters from PDF")
    
    # Analyze with AI
    analysis = await analyze_with_ollama(report_text)
    
    # Match doctors
    suggested_doctors = match_doctors(analysis)
    
    return JSONResponse({
        "success": True,
        "filename": file.filename,
        "analysis": analysis,
        "suggested_doctors": suggested_doctors,
        "report_excerpt": report_text[:500]
    })


@app.get("/doctors")
async def get_all_doctors():
    """Get all doctors in the database."""
    return {"doctors": DOCTORS_DB}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
