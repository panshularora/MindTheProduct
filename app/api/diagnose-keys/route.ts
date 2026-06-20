import { NextResponse } from 'next/server';
import { getApiKey } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';

export async function GET() {
  const groqKey = getApiKey('GROQ_API_KEY');
  const geminiKey = getApiKey('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
  const anthropicKey = getApiKey('ANTHROPIC_API_KEY');

  const status = {
    GROQ_API_KEY_configured: !!(groqKey && !groqKey.includes('your_groq_key_here')),
    GEMINI_API_KEY_configured: !!(geminiKey && !geminiKey.includes('your_gemini_key_here')),
    ANTHROPIC_API_KEY_configured: !!(anthropicKey && !anthropicKey.includes('your_anthropic_key_here')),
  };

  const allConfigured = status.GROQ_API_KEY_configured || status.GEMINI_API_KEY_configured || status.ANTHROPIC_API_KEY_configured;

  return NextResponse.json({
    success: allConfigured,
    message: allConfigured 
      ? 'At least one LLM key is configured successfully.' 
      : 'No valid LLM API keys are configured. Please check your Vercel Project Settings.',
    keys: status
  });
}
