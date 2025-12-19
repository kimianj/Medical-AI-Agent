# AI Primary Care Consultation Agent

This repository contains a prototype AI system designed to conduct primary care consultations for routine cases, with a strong emphasis on patient safety, risk stratification, and human escalation.

The system demonstrates:
<ul>
<li>A structured primary care appointment flow</li>

<li>Deterministic emergency detection and escalation</li>

<li>A five-tier triage model</li>

<li>A natural, empathetic patient experience</li>

<li>Clear validation and safety considerations</li>
</ul>

⚠️ **Disclaimer: This is a prototype for demonstration purposes only and is not intended for real medical use.**

<br />

▶️ **How to Run the Prototype**

This prototype is intentionally self-contained and implemented in a single React component (App.jsx) for ease of review.

1. Create a new React project:
```bash
npx create-react-app ai-primary-care-agent
cd "directory"
```
2. Replace the contents of src/App.jsx with the provided App.jsx file.

3. Start the development server:
```bash
npm start
```
4. Open your browser at:
```bash
http://localhost:3000
```
<br />
🧪 **Demo Scenarios Included**

The UI includes one-click demo buttons for:
<ul>
<li>😷 Mild case (e.g., headache)</li>
<img src= 'https://github.com/kimianj/Medical-AI-Agent/blob/main/mild.gif' title='Video Walkthrough' width='' alt='Video Walkthrough' />

<br />

<li>🚨 Emergency case (e.g., chest pain)</li>
<img src= 'https://github.com/kimianj/Medical-AI-Agent/blob/main/emergency.gif' title='Video Walkthrough' width='' alt='Video Walkthrough' />
</ul>
<br />

**These demonstrate**
<ul>
<li>Correct triage classification</li>
<li>Safety-first escalation</li>
<li>Required linguistic constraints</li>
</ul>

<br />
📄 **Documentation**

**System Design & Validation:** [System-Design.pdf](https://github.com/kimianj/Medical-AI-Agent/blob/main/AI_Agent.pdf)

**Prototype Code:** [App.jsx](https://github.com/kimianj/Medical-AI-Agent/blob/main/src/App.jsx)




