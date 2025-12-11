import { GoogleGenAI, Type, Schema } from "@google/genai";
import { CppQuestion, EvaluationResult, CPP_TOPICS } from "../types.ts";

const MODEL_NAME = "gemini-2.5-flash";

const questionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    code: {
      type: Type.STRING,
      description: "The C++ code snippet. It must be a complete program including #include <iostream> and int main() if it is meant to be runnable. If it is a snippet for a concept, it must still be contextually complete.",
    },
    questionText: {
      type: Type.STRING,
      description: "The specific question to ask the user about the code. MUST BE NEUTRAL and NOT reveal if the code is valid or invalid. (e.g., 'Analyze this code', 'What is the output?', 'Is this code valid?'). MUST BE IN KOREAN.",
    },
    type: {
      type: Type.STRING,
      enum: ["validity", "output", "concept"],
      description: "The type of question.",
    },
    topic: {
      type: Type.STRING,
      description: "The specific C++ topic covered.",
    },
    difficulty: {
      type: Type.STRING,
      enum: ["Beginner", "Intermediate", "Advanced"],
      description: "Estimated difficulty level.",
    }
  },
  required: ["code", "questionText", "type", "topic", "difficulty"],
};

const evaluationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    isCorrect: {
      type: Type.BOOLEAN,
      description: "True if the user's answer demonstrates understanding, False otherwise.",
    },
    feedback: {
      type: Type.STRING,
      description: "Detailed explanation of why the answer is correct or incorrect. Explain the underlying C++ concept clearly. MUST BE IN KOREAN.",
    },
    correctAnswerDetail: {
      type: Type.STRING,
      description: "The definitive correct answer or expected output. MUST BE IN KOREAN.",
    }
  },
  required: ["isCorrect", "feedback", "correctAnswerDetail"],
};

// Helper function to strip C++ comments
const stripComments = (code: string): string => {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
    .replace(/\/\/.*$/gm, "")       // Remove line comments
    .replace(/^\s*[\r\n]/gm, "");   // Remove empty lines resulting from deletion
};

// Helper for delay
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to validate API Key format (Starts with AIza and is approx 39 chars)
const isValidApiKeyFormat = (key: string): boolean => {
  // Regex: Starts with AIza, followed by alphanumeric/dashes/underscores, approx length check
  const apiKeyRegex = /^AIza[0-9A-Za-z-_]{30,40}$/;
  return apiKeyRegex.test(key);
};

// Wrapper to handle Rate Limits (429) automatically
async function generateContentWithRetry(model: any, params: any, retries = 3, delay = 2000): Promise<any> {
  try {
    return await model.generateContent(params);
  } catch (error: any) {
    // Check for rate limit (429) or server overload (503) errors
    const isRateLimit = error.message?.includes('429') || error.status === 429 || error.message?.includes('Resource has been exhausted');
    const isServerOverload = error.message?.includes('503') || error.status === 503;

    if (retries > 0 && (isRateLimit || isServerOverload)) {
      console.warn(`API Rate Limit/Error hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await wait(delay);
      // Exponential backoff: double the delay for the next retry
      return generateContentWithRetry(model, params, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  if (!isValidApiKeyFormat(apiKey)) {
    console.warn("API Key validation failed: Invalid format.");
    return false;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Use generateContent with minimal tokens to verify key and model access
    await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts: [{ text: "Test" }] },
      config: {
        maxOutputTokens: 1,
      }
    });
    return true;
  } catch (error) {
    console.error("API Key Validation Failed:", error);
    return false;
  }
};

export const generateQuestion = async (apiKey: string, selectedTopics: string[] = []): Promise<CppQuestion> => {
  if (!apiKey) throw new Error("API Key is missing");
  if (!isValidApiKeyFormat(apiKey)) throw new Error("API Key format is invalid (Must start with 'AIza')");
  
  // Explicitly log usage to ensure we are using the passed key (debug purpose)
  console.log(`Generating question with Key starting with: ${apiKey.substring(0, 4)}...`);

  const ai = new GoogleGenAI({ apiKey });

  // Use selected topics if provided, otherwise default to all topics
  const topicsPool = selectedTopics.length > 0 ? selectedTopics : CPP_TOPICS;
  const randomTopic = topicsPool[Math.floor(Math.random() * topicsPool.length)];
  
  const systemInstruction = `
    당신은 C++ 전문 교수입니다. 당신의 목표는 무한한 C++ 실전 연습 문제를 한국어로 생성하는 것입니다.
    
    현재 선택된 주제: ${randomTopic}

    주제별 특별 지침:
    1. **연산자 오버로딩 (Operator Overloading)**: 
       - 단순 산술 연산자(+) 외에 까다로운 연산자들을 반드시 포함하세요.
       - **필수 포함 대상**: 
         * 배열 첨자 연산자 'operator[]' (const 및 비-const 버전 구분)
         * 메모리 할당/해제 'operator new', 'operator delete' (전역 및 클래스 멤버)
         * 포인터 접근 'operator->', 역참조 'operator*'
         * 함수 호출 'operator()'
         * 대입 'operator=' (깊은 복사 문제)
    
    2. **템플릿 (Templates)**: 
       - 단순 제네릭 타입 외에 구체적인 문법 사항을 다루세요.
       - **필수 포함 대상**:
         * 템플릿 전면 특수화 (Template Specialization): 'template<> class A<int> { ... }' 형태
         * 부분 특수화 (Partial Specialization)
         * 비타입 템플릿 매개변수 (Non-type template parameters)
         * 함수 템플릿 오버로딩 우선순위

    3. **코드 생성 및 질문 규칙**:
       - **질문 유형 우선순위**: 단순 실행 결과(output) 예측보다는 **"이 코드는 유효한가?(Validity)"** 유형을 **70% 이상** 출제하세요.
       - **유효성 질문 예시**: "이 코드는 컴파일 되는가?", "런타임 에러(Segmentation Fault 등)가 발생하는가?", "메모리 누수가 발생하는가?"
       - 코드는 문법적으로 미묘하게 틀리거나(컴파일 에러), 실행 시 위험한(Undefined Behavior) 함정을 자주 포함해야 합니다.
       - 헤더 파일 누락과 같은 단순 실수가 아닌, 논리적/구조적 결함을 다루세요. (단, 실행 가능한 코드라면 #include <iostream>과 main()은 필수)
       - 모든 질문과 설명은 **한국어**로 작성하세요.
       - **[매우 중요] 코드 내에 주석(//, /**/)을 절대 포함하지 마세요.** 실제 시험 문제지처럼 깨끗한 코드를 제공해야 합니다.
       - **[매우 중요] 코드는 30줄 이내로 짧고 간결하게 작성하세요.** 불필요하게 긴 코드는 피하고 핵심 함정에 집중하세요.
       - 정답을 질문 텍스트에 노출하지 마세요.

    제약 사항:
    - **<vector> 헤더 및 std::vector 금지.** (C-style 배열이나 커스텀 클래스 활용)
    - std::cerr 금지, std::cout 사용.
  `;

  try {
    const result = await generateContentWithRetry(ai.models, {
      model: MODEL_NAME,
      contents: { parts: [{ text: "Generate a new advanced C++ question based on the system instructions." }] },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: questionSchema,
        temperature: 1.2, // Higher creativity for varied code scenarios
      },
    });

    const text = result.text;
    if (!text) throw new Error("No text returned from Gemini API");

    const parsed = JSON.parse(text);
    
    // Ensure comments are stripped and code is clean
    if (parsed.code) {
      parsed.code = stripComments(parsed.code);
    }
    
    return parsed as CppQuestion;
  } catch (error) {
    console.error("GenAI Error:", error);
    throw error;
  }
};

export const evaluateAnswer = async (apiKey: string, question: CppQuestion, userAnswer: string): Promise<EvaluationResult> => {
  if (!apiKey) throw new Error("API Key is missing");
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Question Code:
    ${question.code}

    Question:
    ${question.questionText}

    User's Answer:
    ${userAnswer}

    Evaluate the user's answer. 
    1. Determine if the user correctly identified the validity (valid/invalid), the output (if valid), or the core concept.
    2. Provide detailed feedback in Korean explaining the logic, why it compiles or doesn't, and any caveats (UB, memory leaks, etc.).
    3. Provide the definitive Correct Answer.
  `;

  try {
    const result = await generateContentWithRetry(ai.models, {
      model: MODEL_NAME,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: evaluationSchema,
      },
    });

    const text = result.text;
    if (!text) throw new Error("No text returned from Gemini API");

    return JSON.parse(text) as EvaluationResult;
  } catch (error) {
    console.error("Evaluation Error:", error);
    throw error;
  }
};