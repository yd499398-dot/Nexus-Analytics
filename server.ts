import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { verifyUser, registerUser, addLoginLog, getLogins, deleteUserAndLogins } from './db.ts';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = process.env.PORT || 3000;

  app.use(cors({
    origin: '*',
    credentials: true,
  }));

  app.use(helmet({
    contentSecurityPolicy: false,
  }));

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' }
  });

  app.use(express.json());
  app.use('/api', globalLimiter);

  app.post('/api/signup', loginLimiter, async (req, res) => {
    try {
      let { email, password, name, companyName, companySize, companyRole, isAdmin, passkey } = req.body;
      
      if (email) {
        email = email.trim().toLowerCase();
      }

      if (isAdmin) {
        if (!email || !password || !companyName) {
          return res.status(400).json({ error: 'Email, password, and company name are required for admin registration.' });
        }
        if (passkey !== '6598427') {
          return res.status(401).json({ error: 'Invalid admin passkey.' });
        }
      } else {
        if (!email || !password) {
          return res.status(400).json({ error: 'Email and password are required.' });
        }
      }

      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid, active email address.' });
      }

      const localPart = email.split('@')[0]?.toLowerCase();
      const domainPart = email.split('@')[1]?.toLowerCase();
      
      const disposableDomains = [
        'tempmail.com', 'mailinator.com', 'yopmail.com', 'test.com', 'example.com', 
        'fake.com', 'throwaway.com', 'dispostable.com', 'trashmail.com', 'sharklasers.com', 
        'guerrillamail.com', 'temp-mail.org', 'fakeinbox.com', '10minutemail.com', 'crazymailing.com'
      ];
      
      const fakePrefixes = ['test', 'fake', 'abc', 'asdf', 'qwer', '123', 'dummy', 'user', 'john.doe', 'johndoe', 'xyz', 'foo', 'bar'];
      const isRepeatedChar = /^(.)\1+$/.test(localPart);
      
      if (disposableDomains.includes(domainPart)) {
        return res.status(400).json({ error: 'Corporate registration requires an active business or professional domain. Temporary or disposable email providers are not accepted.' });
      }

      if (fakePrefixes.includes(localPart) || localPart.length < 3 || isRepeatedChar) {
        return res.status(400).json({ error: 'Please use an authentic professional email identity. Generic dummy or placeholder names are blocked.' });
      }

      const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
      if (!passRegex.test(password)) {
        return res.status(400).json({ 
          error: 'Access code/password does not meet security requirements. It must be at least 8 characters long, containing at least one uppercase letter, one lowercase letter, one number, and one special character.' 
        });
      }

      if (isAdmin) {
        if (name && name.trim().length < 2) {
          return res.status(400).json({ error: 'Please enter your authentic full name (at least 2 characters).' });
        }
        if (companyName.trim().length < 2) {
          return res.status(400).json({ error: 'Please specify your company name (at least 2 characters).' });
        }
      }
      
      const role = isAdmin ? 'admin' : 'user';
      const isSuccess = await registerUser(
        email, 
        password, 
        (isAdmin && name) ? name.trim() : undefined, 
        (isAdmin && companyName) ? companyName.trim() : undefined, 
        (isAdmin && companySize) ? companySize : undefined, 
        (isAdmin && companyRole) ? companyRole : undefined, 
        role
      );
      
      if (isSuccess) {
        await addLoginLog(email, 'success');
        res.json({ success: true, role });
      } else {
        res.status(400).json({ error: 'A user account with this professional email already exists.' });
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/login', loginLimiter, async (req, res) => {
    try {
      let { email, password } = req.body;

      if (email) {
        email = email.trim().toLowerCase();
      }

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }
      
      const result = await verifyUser(email, password);
      
      if (result.success) {
        await addLoginLog(email, 'success');
        res.json({ success: true, role: result.role, name: result.name });
      } else {
        await addLoginLog(email, 'failed');
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/logins', async (req, res) => {
    try {
      const logins = await getLogins();
      res.json(logins);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/users/:email', async (req, res) => {
    try {
      let { email } = req.params;

      if (email) {
        email = email.trim().toLowerCase();
      }

      if (!email) {
        return res.status(400).json({ error: 'Email parameter is required' });
      }
      const success = await deleteUserAndLogins(email);
      res.json({ success });
    } catch (error: any) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/analyze-attrition', async (req, res) => {
    try {
      const { 
        salary, 
        commute, 
        satisfaction, 
        role, 
        tenure, 
        overTime, 
        jobInvolvement, 
        lang,
        emailVolumeDecline,
        emailAfterHours,
        emailSentimentRisk,
        emailResponseDelay
      } = req.body;

      const langNames: Record<string, string> = {
        en: 'English',
        es: 'Spanish',
        de: 'German',
        fr: 'French',
        tr: 'Turkish',
        zh: 'Chinese'
      };
      const langName = langNames[lang] || 'English';

      const prompt = `
        You are an advanced HR Attrition Analysis Model. Analyze the following employee data and predict the attrition risk level.
        Provide a detailed step-by-step decision path (like a decision tree) explaining how you arrived at this conclusion based on common HR datasets.
        
        IMPORTANT RULES:
        1. All text fields inside the response MUST be written entirely in ${langName}.
        2. The 'riskLevel' field MUST be strictly one of: "Low", "Medium", or "High" in English.
        
        Employee Data:
        - Role: ${role || 'N/A'}
        - Monthly Salary: ₹${salary || 0}
        - Commute Distance: ${commute || 0} km
        - Satisfaction Score (1-10): ${satisfaction || 0}
        - Tenure (Years): ${tenure || 0}
        - OverTime: ${overTime ? 'Yes' : 'No'}
        - Job Involvement (1-4): ${jobInvolvement || 0}
        - Email volume decline (>30%): ${emailVolumeDecline ? 'Yes' : 'No'}
        - Excessive after-hours emailing: ${emailAfterHours ? 'Yes' : 'No'}
        - Communication sentiment risk flag: ${emailSentimentRisk ? 'Yes' : 'No'}
        - Internal channel response delay: ${emailResponseDelay ? 'Yes' : 'No'}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              riskLevel: { type: Type.STRING },
              riskScore: { type: Type.NUMBER },
              decisionPath: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    condition: { type: Type.STRING },
                    outcome: { type: Type.STRING },
                  },
                },
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['riskLevel', 'riskScore', 'decisionPath', 'recommendations'],
          },
        },
      });

      const jsonStr = response.text?.trim() || '{}';
      res.json(JSON.parse(jsonStr));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'index.html'));
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
