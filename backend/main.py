from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pdfplumber, httpx, json, io, re, base64, logging
from PIL import Image
from database import create_tables, get_db, User, Report
from auth import hash_password, verify_password, create_token, get_current_user, get_optional_user
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

app = FastAPI(title="HealthAI API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

create_tables()

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3"
SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"]

DOCTORS_DB = [
    {"name": "Dr. Rajesh Sharma", "specialization": "General Physician", "phone": "+91-98765-43210", "hospital": "City Medical Center", "available": "Mon-Sat, 9AM-5PM", "keywords": ["general", "fever", "cold", "infection", "fatigue", "weakness"]},
    {"name": "Dr. Priya Mehta", "specialization": "Cardiologist", "phone": "+91-98765-11111", "hospital": "Heart Care Hospital", "available": "Mon-Fri, 10AM-6PM", "keywords": ["heart", "cardiac", "cholesterol", "blood pressure", "hypertension", "ecg", "triglycerides"]},
    {"name": "Dr. Anil Kumar", "specialization": "Endocrinologist", "phone": "+91-98765-22222", "hospital": "Hormone & Diabetes Clinic", "available": "Tue-Sun, 9AM-4PM", "keywords": ["diabetes", "sugar", "thyroid", "tsh", "t3", "t4", "hba1c", "insulin", "glucose", "hormones"]},
    {"name": "Dr. Sunita Verma", "specialization": "Hematologist", "phone": "+91-98765-33333", "hospital": "BloodCare Institute", "available": "Mon-Sat, 8AM-3PM", "keywords": ["blood", "hemoglobin", "anemia", "rbc", "wbc", "platelets", "cbc", "iron", "b12", "ferritin"]},
    {"name": "Dr. Vikram Singh", "specialization": "Nephrologist", "phone": "+91-98765-44444", "hospital": "Kidney Care Center", "available": "Mon-Fri, 11AM-7PM", "keywords": ["kidney", "creatinine", "urea", "bun", "uric acid", "gfr", "renal", "urine"]},
    {"name": "Dr. Meera Gupta", "specialization": "Gastroenterologist", "phone": "+91-98765-55555", "hospital": "Digestive Health Clinic", "available": "Mon-Sat, 10AM-5PM", "keywords": ["liver", "sgpt", "sgot", "alt", "ast", "bilirubin", "hepatitis", "digestion", "stomach"]},
    {"name": "Dr. Rohit Joshi", "specialization": "Pulmonologist", "phone": "+91-98765-66666", "hospital": "Lung & Respiratory Hospital", "available": "Mon-Fri, 9AM-6PM", "keywords": ["lung", "respiratory", "oxygen", "spo2", "chest", "breathing", "asthma", "copd"]},
    {"name": "Dr. Kavita Nair", "specialization": "Nutritionist & Dietitian", "phone": "+91-98765-77777", "hospital": "NutriHealth Clinic", "available": "Mon-Sat, 10AM-4PM", "keywords": ["nutrition", "diet", "vitamin", "mineral", "weight", "bmi", "deficiency"]},
]

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

def get_file_type(filename: str) -> str:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == ".pdf": return "pdf"
    if ext in [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"]: return "image"
    return "unknown"

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    text = ""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t: text += t + "\n"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {str(e)}")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text in PDF.")
    return text

def extract_text_ocr(image_bytes: bytes) -> str:
    if not OCR_AVAILABLE: return ""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        return pytesseract.image_to_string(img).strip()
    except: return ""

def parse_ai_json(text: str) -> dict:
    text = re.sub(r'```json\s*', '', text.strip())
    text = re.sub(r'```\s*', '', text)
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        json_str = match.group()
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        try:
            return json.loads(json_str)
        except:
            return {
                "summary": "Analysis completed. Please review manually.",
                "overall_health_score": 70,
                "normal_values": [],
                "abnormal_values": [],
                "health_problems": [],
                "diet_recommendations": [],
                "treatment_suggestions": [],
                "lifestyle_changes": ["Consult a doctor for detailed analysis"],
                "specialist_needed": ["general"],
                "urgent_attention_required": False,
                "urgent_reason": ""
            }
    raise ValueError("No valid JSON found")

async def analyze_image_with_ollama(image_bytes: bytes) -> dict:
    # Pehle OCR try karo
    if OCR_AVAILABLE:
        ocr_text = extract_text_ocr(image_bytes)
        if ocr_text and len(ocr_text) > 100:
            logger.info(f"OCR extracted {len(ocr_text)} chars — using text model")
            return await analyze_with_ollama(ocr_text)

    # OCR nahi chala toh llava use karo
    img = Image.open(io.BytesIO(image_bytes))
    if max(img.size) > 1500:
        img.thumbnail((1500, 1500), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=85)
    img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    prompt = """List ALL medical test parameters from this report image as JSON only:
{"summary":"overview","overall_health_score":70,"normal_values":[{"parameter":"name","value":"val","normal_range":"range","status":"Normal"}],"abnormal_values":[{"parameter":"name","value":"val","normal_range":"range","status":"High/Low","concern_level":"Mild"}],"health_problems":[{"problem":"name","description":"details","severity":"Mild","affected_organ":"organ"}],"diet_recommendations":[{"category":"Foods to Eat","items":["item1"],"reason":"reason"}],"treatment_suggestions":[{"treatment":"name","description":"details","urgency":"Routine"}],"lifestyle_changes":["change1"],"specialist_needed":["general"],"urgent_attention_required":false,"urgent_reason":""}"""

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            tags_res = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            available = [m["name"] for m in tags_res.json().get("models", [])]
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Ollama is not running!")

        vision_model = next((m for m in available if any(v in m.lower() for v in ["llava","bakllava","moondream","minicpm-v"])), None)

        if not vision_model:
            raise HTTPException(status_code=503, detail="No vision model. Run: ollama pull llava")

        res = await client.post(f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": vision_model, "prompt": prompt, "images": [img_b64], "stream": False, "options": {"temperature": 0.1}})
        if res.status_code != 200:
            raise HTTPException(status_code=503, detail="Vision model error.")
        return parse_ai_json(res.json().get("response", ""))

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            res = await client.post(f"{OLLAMA_BASE_URL}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.1}})
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Ollama is not running!")
        if res.status_code != 200:
            raise HTTPException(status_code=503, detail="Ollama error.")
        return parse_ai_json(res.json().get("response", ""))

async def analyze_image_with_ollama(image_bytes: bytes) -> dict:
    img = Image.open(io.BytesIO(image_bytes))
    if max(img.size) > 1500:
        img.thumbnail((1500, 1500), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=85)
    img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    prompt = """Extract all medical test parameters from this report image.
Return ONLY valid JSON, nothing else:
{
  "summary": "brief health overview",
  "overall_health_score": 70,
  "normal_values": [{"parameter": "name", "value": "val", "normal_range": "range", "status": "Normal"}],
  "abnormal_values": [{"parameter": "name", "value": "val", "normal_range": "range", "status": "High/Low", "concern_level": "Mild"}],
  "health_problems": [{"problem": "name", "description": "details", "severity": "Mild", "affected_organ": "organ"}],
  "diet_recommendations": [{"category": "Foods to Eat", "items": ["item1"], "reason": "reason"}],
  "treatment_suggestions": [{"treatment": "name", "description": "details", "urgency": "Routine"}],
  "lifestyle_changes": ["change1"],
  "specialist_needed": ["general"],
  "urgent_attention_required": false,
  "urgent_reason": ""
}
Extract EVERY parameter visible in the image with exact values."""

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            tags_res = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            available = [m["name"] for m in tags_res.json().get("models", [])]
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Ollama is not running!")

        vision_model = next((m for m in available if any(v in m.lower() for v in ["llava","bakllava","moondream","minicpm-v"])), None)

        if not vision_model:
            ocr_text = extract_text_ocr(image_bytes)
            if ocr_text and len(ocr_text) > 50:
                return await analyze_with_ollama(ocr_text)
            raise HTTPException(status_code=503, detail="No vision model. Run: ollama pull llava")

        res = await client.post(f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": vision_model, "prompt": prompt, "images": [img_b64], "stream": False, "options": {"temperature": 0.1}})
        if res.status_code != 200:
            raise HTTPException(status_code=503, detail="Vision model error.")
        return parse_ai_json(res.json().get("response", ""))

def match_doctors(analysis: dict) -> list:
    kws = []
    for s in analysis.get("specialist_needed", []): kws.append(s.lower())
    for p in analysis.get("health_problems", []): kws.extend([p.get("affected_organ","").lower(), p.get("problem","").lower()])
    for v in analysis.get("abnormal_values", []): kws.append(v.get("parameter","").lower())
    kw_str = " ".join(kws)
    matched = [d for d in DOCTORS_DB if any(k in kw_str for k in d["keywords"])]
    general = next((d for d in DOCTORS_DB if d["specialization"] == "General Physician"), None)
    if general and general not in matched: matched.insert(0, general)
    return matched[:4]

@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(name=req.name, email=req.email, hashed_password=hash_password(req.password))
    db.add(user); db.commit(); db.refresh(user)
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email}

@app.get("/reports/history")
def get_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reports = db.query(Report).filter(Report.user_id == current_user.id).order_by(Report.uploaded_at.desc()).all()
    return {"reports": [{"id": r.id, "filename": r.filename, "health_score": r.health_score,
        "summary": r.summary, "uploaded_at": r.uploaded_at.isoformat(),
        "analysis": json.loads(r.analysis_json)} for r in reports]}

@app.get("/reports/compare/all")
def compare_reports(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reports = db.query(Report).filter(Report.user_id == current_user.id).order_by(Report.uploaded_at.asc()).all()
    if len(reports) < 2: raise HTTPException(status_code=400, detail="Need at least 2 reports")
    comparison = []
    for r in reports:
        analysis = json.loads(r.analysis_json)
        all_params = {}
        for v in analysis.get("normal_values", []) + analysis.get("abnormal_values", []):
            all_params[v["parameter"]] = v["value"]
        comparison.append({"report_id": r.id, "filename": r.filename,
            "date": r.uploaded_at.isoformat(), "health_score": r.health_score, "parameters": all_params})
    return {"comparison": comparison}

@app.get("/reports/{report_id}")
def get_report(report_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id, Report.user_id == current_user.id).first()
    if not report: raise HTTPException(status_code=404, detail="Report not found")
    return {"id": report.id, "filename": report.filename, "health_score": report.health_score,
        "summary": report.summary, "uploaded_at": report.uploaded_at.isoformat(),
        "analysis": json.loads(report.analysis_json)}

@app.delete("/reports/{report_id}")
def delete_report(report_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id, Report.user_id == current_user.id).first()
    if not report: raise HTTPException(status_code=404, detail="Report not found")
    db.delete(report); db.commit()
    return {"message": "Report deleted"}

@app.post("/analyze-report")
async def analyze_report(file: UploadFile = File(...),
    current_user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    filename = file.filename or "upload"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type.")
    if file.size and file.size > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File must be under 15MB.")
    file_bytes = await file.read()
    file_type = get_file_type(filename)
    if file_type == "pdf":
        text = extract_text_from_pdf(file_bytes)
        analysis = await analyze_with_ollama(text)
        excerpt = text[:500]
    elif file_type == "image":
        analysis = await analyze_image_with_ollama(file_bytes)
        excerpt = "Image analyzed using AI vision."
    else:
        raise HTTPException(status_code=400, detail="Unknown file type.")
    report_id = None
    if current_user:
        report = Report(user_id=current_user.id, filename=filename, file_type=file_type,
            health_score=analysis.get("overall_health_score", 0),
            summary=analysis.get("summary", ""), analysis_json=json.dumps(analysis))
        db.add(report); db.commit(); db.refresh(report)
        report_id = report.id
        logger.info(f"Report saved for user {current_user.email}, report_id={report_id}")
    return JSONResponse({"success": True, "filename": filename, "file_type": file_type,
        "analysis": analysis, "suggested_doctors": match_doctors(analysis),
        "report_excerpt": excerpt, "report_id": report_id, "saved": current_user is not None})

@app.get("/")
async def root():
    return {"message": "HealthAI API v3.0 running!"}

@app.get("/health")
async def health_check():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            models = [m["name"] for m in res.json().get("models", [])]
            has_vision = any(any(v in m.lower() for v in ["llava","bakllava","moondream","minicpm"]) for m in models)
            return {"status": "healthy", "ollama": "connected", "models": models, "vision_available": has_vision}
    except:
        return {"status": "warning", "ollama": "disconnected"}

@app.get("/doctors")
async def get_all_doctors():
    return {"doctors": DOCTORS_DB}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)