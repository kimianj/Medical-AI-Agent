import React, { useState, useRef, useEffect } from 'react';

const SYSTEM_PROMPT = `You are an AI primary care consultation assistant. Your role is to gather symptoms, provide guidance for mild conditions, and escalate emergencies appropriately.

CORE RULES:
1. Start by greeting warmly and asking what brings them in today
2. Always state upfront: "I can provide guidance, but I cannot replace an in-person examination"
3. Ask about symptom timeline using: "When did this first start, and has it been getting better, worse, or staying the same?"

EMERGENCY DETECTION (immediate escalation):
- Chest pain, pressure, or tightness
- Difficulty breathing or shortness of breath  
- Signs of stroke (face drooping, arm weakness, speech difficulty)
- Severe bleeding, loss of consciousness, severe allergic reaction

For emergencies, respond: "Based on what you've told me, [assessment]. This is beyond what I can safely assess remotely. Here's what I recommend: Call 911 or go to the emergency room immediately."

MILD SYMPTOM HANDLING (fatigue, headaches, minor issues):
1. Gather information: onset, duration, severity (1-10), what makes it better/worse
2. Screen for red flags with targeted questions
3. Before recommending, ask: "What concerns you most about this?"
4. Provide exactly 3 numbered self-care recommendations
5. End with: "How does this sound to you?"
6. Include: "If this isn't improving in [X days], please contact your healthcare provider"

LANGUAGE REQUIREMENTS:
- Use "I understand" (never "I see" or "I hear")
- No medical jargon—use "high blood pressure" not "hypertension"
- For worry: "It's completely understandable that you're concerned about [symptom]"
- For pain: "That sounds really uncomfortable"
- Never say "don't worry"—use "let's work through this together"

Always prioritize safety. When uncertain, escalate to human care.`;

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: `Hello! I'm your AI health consultation assistant. I'm here to help you understand your symptoms and provide guidance.

Before we begin, I want you to know: I can provide guidance, but I cannot replace an in-person examination. If at any point you feel you need to see a doctor in person, please don't hesitate to do so.

What brings you in today?`,
  phase: 'GREETING'
};

const TRIAGE_TIERS = {
  EMERGENT: 'TIER_1_EMERGENT',
  URGENT_HIGH: 'TIER_2_URGENT_HIGH',
  URGENT_LOW: 'TIER_3_URGENT_LOW',
  NON_URGENT: 'TIER_4_NON_URGENT',
  ADVICE_ONLY: 'TIER_5_ADVICE_ONLY'
};


// Check for emergency symptoms
const isEmergency = (text) => {
  const emergencyKeywords = [
    'chest pain', 'chest pressure', 'chest tight', 'can\'t breathe', 
    'difficulty breathing', 'shortness of breath', 'hard to breathe',
    'heart attack', 'stroke', 'face drooping', 'arm weakness', 'slurred speech', 
    'passing out', 'unconscious', 'severe bleeding', 'can\'t move', 
    'worst headache of my life', 'crushing pain', 'numbness in arm',
    'numbness in face', 'can\'t speak', 'vision loss', 'sudden blindness'
  ];
  
  const lowerText = text.toLowerCase();
  return emergencyKeywords.some(keyword => lowerText.includes(keyword));
};

// Extract symptom the user mentioned
const extractSymptom = (text) => {
  const lowerText = text.toLowerCase();
  
  // Common symptom patterns, order matters (more specific first)
  const patterns = [
    { match: ['asthma attack', 'asthma flare', 'asthma acting up'], label: 'asthma symptoms' },
    { match: ['neck pain', 'neck hurts', 'stiff neck'], label: 'neck pain' },
    { match: ['back pain', 'back hurts', 'backache'], label: 'back pain' },
    { match: ['headache', 'head hurts', 'head pain', 'migraine'], label: 'headache' },
    { match: ['stomach ache', 'stomach pain', 'stomach hurts', 'belly pain'], label: 'stomach pain' },
    { match: ['sore throat', 'throat hurts', 'throat pain'], label: 'sore throat' },
    { match: ['fever', 'temperature', 'feeling hot', 'chills'], label: 'fever' },
    { match: ['tired', 'fatigue', 'exhausted', 'no energy', 'worn out'], label: 'fatigue' },
    { match: ['cold', 'runny nose', 'congestion', 'stuffy nose', 'sneezing'], label: 'cold symptoms' },
    { match: ['cough', 'coughing'], label: 'cough' },
    { match: ['nausea', 'nauseous', 'vomiting', 'throwing up', 'sick to my stomach'], label: 'nausea' },
    { match: ['dizzy', 'dizziness', 'lightheaded', 'vertigo'], label: 'dizziness' },
    { match: ['can\'t sleep', 'insomnia', 'trouble sleeping', 'not sleeping'], label: 'sleep problems' },
    { match: ['anxious', 'anxiety', 'stressed', 'panic', 'worried'], label: 'anxiety' },
    { match: ['rash', 'itchy', 'skin', 'hives'], label: 'skin issues' },
    { match: ['pain', 'hurts', 'ache', 'sore'], label: 'pain' },
  ];
  
  for (const pattern of patterns) {
    if (pattern.match.some(m => lowerText.includes(m))) {
      return pattern.label;
    }
  }
  
  return 'your symptoms';
};

const computeRiskScore = (context) => {
  let score = 0;

  // Severity contribution
  if (context.severity >= 7) score += 3;
  else if (context.severity >= 4) score += 2;

  // Progression
  if (context.progression === 'worse') score += 2;

  // Risk factors
  if (context.riskFactors.includes('asthma')) score += 2;
  if (context.riskFactors.includes('heart_disease')) score += 3;

  // Vitals-based risk
  if (context.vitals?.heartRate > 100) score += 2;
  if (context.vitals?.temperature > 38.5) score += 1;

  return score;
};

const determineTriageTier = (context, userMessage = '') => {
  // Check for emergency keywords FIRST - these are always Tier 1
  if (userMessage && isEmergency(userMessage)) {
    return TRIAGE_TIERS.EMERGENT;
  }
  
  // Asthma exacerbation with risk factors = Tier 2 (urgent, not 911 emergency)
  if (context.redFlags.includes('asthma_exacerbation_possible')) {
    return TRIAGE_TIERS.URGENT_HIGH;
  }
  

  if (context.redFlags.length > 0) {
    return TRIAGE_TIERS.EMERGENT;
  }

  const score = computeRiskScore(context);

  if (score >= 8) return TRIAGE_TIERS.URGENT_HIGH;
  if (score >= 5) return TRIAGE_TIERS.URGENT_LOW;
  if (score >= 2) return TRIAGE_TIERS.NON_URGENT;
  return TRIAGE_TIERS.ADVICE_ONLY;
};

const tool_getRecentVitals = () => ({
  heartRate: 92,
  temperature: 38.1
});

const tool_lookupHistory = () => ({
  conditions: ['asthma']
});


const SAFETY_THRESHOLDS = {
  emergencyRecallTarget: 0.995,
  latencyMsTier1: 500,
  rollbackComplianceThreshold: 0.98
};


// Generate response based on conversation phase
const generateResponse = ({
  userMessage,
  conversationPhase,
  symptomContext
}) => {
  const lowerMsg = userMessage.toLowerCase();
  
  // ALWAYS check for emergency first
  if (isEmergency(userMessage)) {
    const emergencySymptom = userMessage.toLowerCase();
    return {
      content: `Based on what you've told me, these symptoms could indicate a serious medical emergency. This is beyond what I can safely assess remotely.

Here's what I recommend: Please call 911 or have someone take you to the nearest emergency room immediately. Do not drive yourself.

While waiting for help:
• Sit or lie down in a comfortable position
• If someone is with you, let them know what's happening
• Try to stay calm and take slow, steady breaths if possible
• Loosen any tight clothing

Your safety is the priority right now. Please seek emergency care immediately. Is someone with you who can help?`,
      nextPhase: 'EMERGENCY',
      symptom: emergencySymptom
    };
  }

  // Handle based on current phase
  switch (conversationPhase) {
    case 'GREETING':
      // User just described their initial symptoms
      const detectedSymptom = extractSymptom(userMessage);
      return {
        content: `I understand you're experiencing ${detectedSymptom}. That sounds really uncomfortable, and I appreciate you sharing that with me.

To help me better understand what you're going through:

When did this first start, and has it been getting better, worse, or staying the same?`,
        nextPhase: 'ASKED_TIMELINE',
        symptom: detectedSymptom
      };
    
    case 'ASKED_TIMELINE':
      // User answered the timeline question
      return {
        content: `I understand. Thank you for sharing that information—it really helps me get a clearer picture of what you're experiencing.

Before I share some suggestions that might help, I'd like to ask: What concerns you most about this?`,
        nextPhase: 'ASKED_CONCERNS',
        symptom: symptomContext
      };
    
    case 'ASKED_CONCERNS':
      // User shared their concerns, now give recommendations
      return {
        content: getRecommendations(symptomContext),
        nextPhase: 'GAVE_RECOMMENDATIONS',
        symptom: symptomContext
      };
    
    case 'GAVE_RECOMMENDATIONS':
      // Handle follow-up after recommendations
      if (lowerMsg.includes('yes') || lowerMsg.includes('sound') || lowerMsg.includes('thank') || 
          lowerMsg.includes('helpful') || lowerMsg.includes('great') || lowerMsg.includes('good') ||
          lowerMsg.includes('will try') || lowerMsg.includes('ok') || lowerMsg.includes('okay')) {
        return {
          content: `I'm glad I could help. Remember, I can provide guidance, but I cannot replace an in-person examination.

Please don't hesitate to reach out to your healthcare provider if:
• Your symptoms don't improve in the timeframe we discussed
• You develop any new or worsening symptoms
• You simply feel you'd like to be seen in person

Take care of yourself, and I hope you feel better soon. Is there anything else you'd like to discuss?`,
          nextPhase: 'CLOSING',
          symptom: symptomContext
        };
      }
      
      if (lowerMsg.includes('no') || lowerMsg.includes('that\'s all') || lowerMsg.includes('nothing else') || lowerMsg.includes('bye')) {
        return {
          content: `Take care! Remember the guidance we discussed, and please don't hesitate to see a healthcare provider if your symptoms don't improve or if you have any concerns. Wishing you a speedy recovery! 💙`,
          nextPhase: 'ENDED',
          symptom: symptomContext
        };
      }
      
      return {
        content: `I understand. Is there anything specific about the recommendations you'd like me to clarify, or is there something else on your mind?`,
        nextPhase: 'GAVE_RECOMMENDATIONS',
        symptom: symptomContext
      };
    
    case 'CLOSING':
      if (lowerMsg.includes('yes') || lowerMsg.includes('actually') || lowerMsg.includes('one more')) {
        return {
          content: `Of course! What else would you like to discuss?`,
          nextPhase: 'GREETING',
          symptom: null
        };
      }
      return {
        content: `Take care of yourself! Don't hesitate to reach out to a healthcare provider if you need further assistance. Wishing you well! 💙`,
        nextPhase: 'ENDED',
        symptom: symptomContext
      };
    
    case 'EMERGENCY':
      return {
        content: `Please focus on getting emergency care right now. Call 911 if you haven't already. Your health and safety are the top priority.`,
        nextPhase: 'EMERGENCY',
        symptom: symptomContext
      };
    
    default:
      return {
        content: `I understand. Could you tell me what symptoms are bothering you so I can try to help?`,
        nextPhase: 'GREETING',
        symptom: null
      };
  }
};

const getRecommendations = (symptom) => {
  const symptomLower = (symptom || '').toLowerCase();
  
  // Asthma symptoms - urgent but not emergency
  if (symptomLower.includes('asthma')) {
    return `I understand you're experiencing asthma symptoms. This needs careful attention, especially given your history.

Based on what you've shared, here's what I recommend:

1. **Use your rescue inhaler (if prescribed)** — Take 2-4 puffs of your quick-relief inhaler (like albuterol). Wait 20 minutes to see if symptoms improve.

2. **Sit upright and try to stay calm** — Sitting up helps your lungs expand. Anxiety can worsen breathing difficulty, so try slow, pursed-lip breathing.

3. **Monitor your symptoms closely** — If your inhaler isn't helping within 20 minutes, or if you're using it more than every 4 hours, you need medical attention.

**Important:** Because you have a history of asthma, I recommend you be seen by a healthcare provider within the next 24 hours, even if your symptoms improve. You may need your treatment plan adjusted.

How does this sound to you?

**Seek emergency care immediately if:**
• Your rescue inhaler provides no relief
• You cannot speak in full sentences
• Your lips or fingernails turn blue
• You're struggling to breathe even while resting`;
  }
  
  // Fever-related
  if (symptomLower.includes('fever')) {
    return `It's completely understandable that you're concerned about your fever. A fever can make you feel quite unwell, and it's your body's way of fighting off infection.

Based on what you've shared, here are three things that may help:

1. **Stay hydrated and rest** — Fever increases fluid loss, so drink plenty of water, clear broths, or electrolyte drinks. Rest allows your body to focus energy on recovery.

2. **Use fever-reducing medication if needed** — Over-the-counter options like acetaminophen or ibuprofen can help reduce fever and relieve discomfort. Follow package directions carefully.

3. **Keep cool but don't overchill** — Wear light clothing and use a light blanket. A lukewarm (not cold) compress on your forehead can provide comfort.

How does this sound to you?

If this isn't improving in 3 days, or if your fever goes above 103°F (39.4°C), please contact your healthcare provider. Please seek immediate care if you develop a stiff neck with fever, difficulty breathing, severe headache, or a rash that doesn't fade when pressed.`;
  }
  
  // Neck pain
  if (symptomLower.includes('neck')) {
    return `It's completely understandable that you're concerned about your neck pain. Neck discomfort can really affect your daily activities and comfort.

Based on what you've shared, here are three things that may help:

1. **Apply heat or ice** — For the first 48 hours, try ice wrapped in a cloth for 15-20 minutes. After that, switch to a warm compress or heating pad to relax tight muscles.

2. **Gentle stretching and movement** — Slowly turn your head side to side and tilt ear to shoulder. Avoid sudden movements, but gentle motion can prevent stiffness from worsening.

3. **Check your posture and sleeping position** — Make sure your computer screen is at eye level, and try sleeping with a supportive pillow that keeps your neck aligned with your spine.

How does this sound to you?

If this isn't improving in 5-7 days, please contact your healthcare provider. Please seek immediate care if you have neck pain with fever and headache together, numbness or tingling in your arms, or if the pain followed an injury or accident.`;
  }
  
  // Fatigue
  if (symptomLower.includes('fatigue') || symptomLower.includes('tired') || symptomLower.includes('exhausted')) {
    return `It's completely understandable that you're concerned about your fatigue. Persistent tiredness can really affect your quality of life.

Based on what you've shared, here are three things that may help:

1. **Prioritize consistent sleep timing** — Try to go to bed and wake up at the same time each day, even on weekends, aiming for 7-9 hours of sleep.

2. **Stay hydrated and review your diet** — Sometimes fatigue is linked to dehydration or missing nutrients. Aim for 8 glasses of water daily and include iron-rich foods like leafy greens.

3. **Take short movement breaks** — Even a 10-15 minute walk can boost energy levels and improve circulation.

How does this sound to you?

If this isn't improving in 7 days, please contact your healthcare provider. Please seek care sooner if you experience fever, unexplained weight loss, or fatigue severe enough to prevent normal daily activities.`;
  }
  
  // Headache
  if (symptomLower.includes('headache') || symptomLower.includes('head')) {
    return `It's completely understandable that you're concerned about your headaches. Head pain can be really disruptive.

Based on what you've shared, here are three things that may help:

1. **Stay hydrated and rest in a quiet, dark room** — Dehydration and sensory overload are common headache triggers.

2. **Apply a cold or warm compress** — Try a cold pack on your forehead or a warm compress on the back of your neck.

3. **Consider over-the-counter pain relief** — Medications like acetaminophen or ibuprofen can help. Follow package directions.

How does this sound to you?

If this isn't improving in 3 days, please contact your healthcare provider. Please seek immediate care if you experience the worst headache of your life, headache with fever and stiff neck, or headache following a head injury.`;
  }
  
  // Sore throat
  if (symptomLower.includes('throat')) {
    return `It's completely understandable that you're concerned about your sore throat. Throat pain can make eating and talking uncomfortable.

Based on what you've shared, here are three things that may help:

1. **Gargle with warm salt water** — Mix 1/4 teaspoon of salt in 8 ounces of warm water. Gargle several times a day.

2. **Stay hydrated with warm liquids** — Warm tea with honey, broth, or warm water with lemon can soothe your throat.

3. **Use throat lozenges or over-the-counter pain relievers** — These can provide temporary relief from pain and irritation.

How does this sound to you?

If this isn't improving in 5 days, please contact your healthcare provider. Please seek care sooner if you develop a high fever, difficulty swallowing or breathing, or see white patches on your tonsils.`;
  }
  
  // Cold/congestion
  if (symptomLower.includes('cold') || symptomLower.includes('congestion') || symptomLower.includes('runny') || symptomLower.includes('cough')) {
    return `It's completely understandable that you're concerned about your cold symptoms. Dealing with congestion and feeling unwell is never pleasant.

Based on what you've shared, here are three things that may help:

1. **Rest and stay hydrated** — Your body needs energy to fight the infection. Drink plenty of water, herbal tea, or warm broth.

2. **Use steam and saline** — A hot shower or breathing over a bowl of hot water can help with congestion. Saline nasal spray can clear nasal passages.

3. **Manage symptoms with over-the-counter remedies** — Decongestants can help with stuffiness. Follow package directions carefully.

How does this sound to you?

If this isn't improving in 7-10 days, please contact your healthcare provider. Please seek care sooner if you develop a high fever, difficulty breathing, or symptoms that suddenly worsen.`;
  }
  
  // Stomach/nausea
  if (symptomLower.includes('stomach') || symptomLower.includes('nausea')) {
    return `It's completely understandable that you're concerned about your stomach issues. Digestive discomfort can really affect your day.

Based on what you've shared, here are three things that may help:

1. **Stick to bland, easy-to-digest foods** — Try bananas, rice, applesauce, and toast. Avoid fatty or spicy foods.

2. **Stay hydrated with small, frequent sips** — Sip water, clear broth, or electrolyte drinks slowly throughout the day.

3. **Rest and avoid lying flat** — If you're nauseous, try sitting upright or propping yourself up with pillows.

How does this sound to you?

If this isn't improving in 2-3 days, please contact your healthcare provider. Please seek immediate care if you notice blood in your stool or vomit, severe abdominal pain, or signs of dehydration.`;
  }
  
  // Pain (generic)
  if (symptomLower.includes('pain') || symptomLower.includes('hurt') || symptomLower.includes('ache') || symptomLower.includes('sore')) {
    return `It's completely understandable that you're concerned about your pain. Discomfort can really affect your quality of life.

Based on what you've shared, here are three things that may help:

1. **Rest the affected area** — Avoid activities that aggravate the pain, but gentle movement can help prevent stiffness.

2. **Try ice or heat therapy** — Ice can help with inflammation (use for 15-20 minutes wrapped in cloth). Heat can relax muscles and ease stiffness.

3. **Consider over-the-counter pain relief** — Acetaminophen or ibuprofen can help manage pain. Follow package directions and don't exceed recommended doses.

How does this sound to you?

If this isn't improving in 5-7 days, please contact your healthcare provider. Please seek care sooner if the pain is severe, worsening, or accompanied by fever, swelling, or loss of function.`;
  }
  
  // Default/general
  return `It's completely understandable that you're concerned about ${symptom}. Let's work through this together.

Based on what you've shared, here are three things that may help:

1. **Rest and give your body time to recover** — Try to get adequate sleep and avoid overexertion for the next few days.

2. **Stay well-hydrated** — Drink plenty of water, clear broths, or herbal teas to support your body's natural healing.

3. **Monitor your symptoms** — Keep track of any changes. Note if things are improving, staying the same, or getting worse.

How does this sound to you?

If this isn't improving in 5 days, please contact your healthcare provider. Please seek care sooner if your symptoms worsen significantly or you develop new concerning symptoms like high fever, severe pain, or difficulty breathing.`;
};

const callClinicalTools = (context) => {
  const history = tool_lookupHistory();
  const vitals = tool_getRecentVitals();

  return {
    history,
    vitals
  };
};


export default function App() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('GREETING');
  const [currentSymptom, setCurrentSymptom] = useState(null);
  const messagesEndRef = useRef(null);

  const [patientContext, setPatientContext] = useState({
  age: null,
  riskFactors: [],        
  symptom: null,
  severity: null,          
  progression: null,      
  redFlags: [],
  vitals: null,
  history: null,
  triageTier: null
});

  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSend = () => {
    if (!input.trim() || isTyping) return;
    
    const userMessage = { role: 'user', content: input, phase: currentPhase };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    
    // Generate response based on current phase
    const response = generateResponse({
      userMessage: input,
      conversationPhase: currentPhase,
      symptomContext: currentSymptom
    });
    
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.content,
        phase: response.nextPhase 
      }]);
      setCurrentPhase(response.nextPhase);
      if (response.symptom) {
        setCurrentSymptom(response.symptom);
      }
      setIsTyping(false);
    }, 800 + Math.random() * 700);

let updatedContext = { 
  ...patientContext,
  redFlags: [...(patientContext.redFlags || [])]
};

// Extract symptom
if (!updatedContext.symptom) {
  updatedContext.symptom = extractSymptom(input);
}

// Tool calling (simulated EHR + vitals)
if (!updatedContext.vitals || !updatedContext.history) {
  const tools = callClinicalTools(updatedContext);
  updatedContext.vitals = tools.vitals;
  updatedContext.history = tools.history;
  updatedContext.riskFactors = [...(tools.history.conditions || [])];
}

// Partial / gray-zone
if (
  updatedContext.riskFactors.includes('asthma') &&
  input.toLowerCase().includes('asthma')
) {
  updatedContext.redFlags = [...updatedContext.redFlags, 'asthma_exacerbation_possible'];
}

// Compute triage tier - pass the input message to check for emergency keywords
updatedContext.triageTier = determineTriageTier(updatedContext, input);

// Persist context
setPatientContext(updatedContext);

  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const resetConversation = () => {
    setMessages([INITIAL_MESSAGE]);
    setInput('');
    setCurrentPhase('GREETING');
    setCurrentSymptom(null);
    setPatientContext({
      age: null,
      riskFactors: [],        
      symptom: null,
      severity: null,          
      progression: null,      
      redFlags: [],
      vitals: null,
      history: null,
      triageTier: null
    });
  };
  
  const loadScenario = (type) => {
    resetConversation();
    setTimeout(() => {
      const msg = type === 'mild' 
        ? "I have a neck pain and fever"
        : "I'm having chest pain and pressure in the center of my chest. It started about an hour ago.";
      setInput(msg);
    }, 100);
  };

  const getPhaseLabel = (phase) => {
    const labels = {
      'GREETING': '👋 Awaiting symptoms',
      'ASKED_TIMELINE': '📅 Asked timeline',
      'ASKED_CONCERNS': '💭 Asked concerns',
      'GAVE_RECOMMENDATIONS': '✅ Gave recommendations',
      'CLOSING': '👋 Closing',
      'ENDED': '🏁 Ended',
      'EMERGENCY': '🚨 EMERGENCY'
    };
    return labels[phase] || phase;
  };

  const getTriageLabel = (tier) => {
    const labels = {
      'TIER_1_EMERGENT': '🔴 TIER 1: EMERGENT',
      'TIER_2_URGENT_HIGH': '🟠 TIER 2: URGENT',
      'TIER_3_URGENT_LOW': '🟡 TIER 3: SEMI-URGENT',
      'TIER_4_NON_URGENT': '🟢 TIER 4: NON-URGENT',
      'TIER_5_ADVICE_ONLY': '⚪ TIER 5: ADVICE'
    };
    return labels[tier] || tier;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #f0f4f8 0%, #d9e2ec 100%)',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      padding: '16px'
    }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
      `}</style>
      
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1a365d 0%, #2c5282 100%)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 24px',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '52px', height: '52px',
                background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
                borderRadius: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '26px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}>🩺</div>
              <div>
                <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '600', letterSpacing: '-0.3px' }}>
                  AI Primary Care Consultation
                </h1>
                <p style={{ margin: '3px 0 0', fontSize: '12px', opacity: 0.85 }}>
                  Interactive Prototype Demo
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => setShowPrompt(!showPrompt)} style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', padding: '8px 14px', color: 'white',
                cursor: 'pointer', fontSize: '12px', fontWeight: '500'
              }}>
                {showPrompt ? '✕ Hide' : '📋 View'} Prompt
              </button>
              <button onClick={resetConversation} style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', padding: '8px 14px', color: 'white',
                cursor: 'pointer', fontSize: '12px', fontWeight: '500'
              }}>↻ New Chat</button>
            </div>
          </div>
          
          {/* Scenario Buttons */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', opacity: 0.8 }}>Quick test:</span>
            <button onClick={() => loadScenario('mild')} style={{
              background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)', 
              border: 'none', borderRadius: '6px',
              padding: '6px 14px', color: 'white', cursor: 'pointer',
              fontSize: '11px', fontWeight: '600', boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
            }}>😷 Mild: Neck Pain + Fever</button>
            <button onClick={() => loadScenario('emergency')} style={{
              background: 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)', 
              border: 'none', borderRadius: '6px',
              padding: '6px 14px', color: 'white', cursor: 'pointer',
              fontSize: '11px', fontWeight: '600', boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
            }}>🚨 Emergency: Chest Pain</button>
          </div>
          
          {/* Phase Indicator */}
          <div style={{ 
            marginTop: '12px', padding: '8px 12px', 
            background: 'rgba(255,255,255,0.1)', borderRadius: '8px',
            fontSize: '11px', display: 'flex', gap: '16px', flexWrap: 'wrap'
          }}>
            <span><strong>Phase:</strong> {getPhaseLabel(currentPhase)}</span>
            {currentSymptom && <span><strong>Symptom:</strong> {currentSymptom}</span>}
            {patientContext.triageTier && <span><strong>Triage:</strong> {getTriageLabel(patientContext.triageTier)}</span>}
          </div>
        </div>
        
        {/* System Prompt */}
        {showPrompt && (
          <div style={{
            background: '#1a202c', padding: '16px 20px', color: '#a0aec0',
            fontSize: '11px', lineHeight: '1.7', whiteSpace: 'pre-wrap',
            maxHeight: '200px', overflowY: 'auto', borderBottom: '2px solid #2c5282'
          }}>
            <div style={{ color: '#63b3ed', fontWeight: '600', marginBottom: '8px', fontSize: '12px' }}>
              📄 SYSTEM PROMPT ({SYSTEM_PROMPT.split(/\s+/).length} words)
            </div>
            {SYSTEM_PROMPT}
          </div>
        )}
        
        {/* Chat Area */}
        <div style={{
          background: 'white', minHeight: '380px', maxHeight: '420px',
          overflowY: 'auto', padding: '20px'
        }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '14px'
            }}>
              <div style={{
                maxWidth: '85%',
                padding: '14px 18px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.role === 'user' 
                  ? 'linear-gradient(135deg, #2b6cb0 0%, #1a365d 100%)' 
                  : '#f7fafc',
                color: msg.role === 'user' ? 'white' : '#2d3748',
                fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-wrap',
                boxShadow: msg.role === 'user' 
                  ? '0 2px 8px rgba(26,54,93,0.25)' 
                  : '0 1px 3px rgba(0,0,0,0.08)',
                border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0'
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div style={{ display: 'flex', marginBottom: '14px' }}>
              <div style={{
                padding: '14px 20px', borderRadius: '18px 18px 18px 4px',
                background: '#f7fafc', color: '#718096', fontSize: '13px',
                border: '1px solid #e2e8f0'
              }}>
                <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', marginRight: '4px' }}>Thinking</span>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: '#4299e1',
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`
                    }}/>
                  ))}
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input */}
        <div style={{
          background: '#f7fafc', padding: '16px 20px',
          borderRadius: '0 0 20px 20px', borderTop: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <textarea
              value={input} 
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Describe your symptoms..."
              disabled={isTyping}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: '12px',
                border: '2px solid #e2e8f0', fontSize: '13px', resize: 'none',
                minHeight: '48px', maxHeight: '100px', fontFamily: 'inherit',
                outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
                opacity: isTyping ? 0.7 : 1
              }}
              onFocus={(e) => { 
                if (!isTyping) {
                  e.target.style.borderColor = '#3182ce'; 
                  e.target.style.boxShadow = '0 0 0 3px rgba(49,130,206,0.15)'; 
                }
              }}
              onBlur={(e) => { 
                e.target.style.borderColor = '#e2e8f0'; 
                e.target.style.boxShadow = 'none'; 
              }}
            />
            <button 
              onClick={handleSend} 
              disabled={!input.trim() || isTyping} 
              style={{
                background: input.trim() && !isTyping 
                  ? 'linear-gradient(135deg, #2b6cb0 0%, #1a365d 100%)' 
                  : '#cbd5e0',
                color: 'white', border: 'none', borderRadius: '12px',
                padding: '12px 22px', fontSize: '13px', fontWeight: '600',
                cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s', 
                boxShadow: input.trim() && !isTyping ? '0 2px 8px rgba(26,54,93,0.3)' : 'none'
              }}
            >
              Send
            </button>
          </div>
          <p style={{
            margin: '12px 0 0', fontSize: '10px', color: '#a0aec0', textAlign: 'center'
          }}>
            ⚠️ This is a prototype demonstration only — not for actual medical use
          </p>
        </div>
      </div>
    </div>
  );
}

