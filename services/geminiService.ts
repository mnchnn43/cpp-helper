import { GoogleGenAI, Type, Schema } from "@google/genai";
import { CppQuestion, EvaluationResult, CPP_TOPICS } from "../types";

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
  try {
    const ai = new GoogleGenAI({ apiKey });
    // Try a very cheap operation to verify the key
    await ai.models.countTokens({
      model: MODEL_NAME,
      contents: "Test",
    });
    return true;
  } catch (error) {
    console.error("API Key Validation Failed:", error);
    return false;
  }
};

export const generateQuestion = async (apiKey: string, selectedTopics: string[] = []): Promise<CppQuestion> => {
  if (!apiKey) throw new Error("API Key is missing");
  
  // Explicitly log usage to ensure we are using the passed key (debug purpose)
  console.log(`Generating question with Key starting with: ${apiKey.substring(0, 4)}...`);

  const ai = new GoogleGenAI({ apiKey });

  // Use selected topics if provided, otherwise default to all topics
  const topicsPool = selectedTopics.length > 0 ? selectedTopics : CPP_TOPICS;
  const randomTopic = topicsPool[Math.floor(Math.random() * topicsPool.length)];
  
  const systemInstruction = `
    당신은 C++ 전문 교수입니다. 당신의 목표는 무한한 C++ 실전 연습 문제를 한국어로 생성하는 것입니다.
    
    코드 생성 규칙:
    1. 코드는 짧지만 독립적으로 실행 가능해야 합니다.
    2. 헤더 파일 누락과 같은 단순한 문법 오류를 묻는 문제가 아니라면, 항상 #include <iostream>과 완전한 'int main() { ... }' 블록을 포함하세요.
    3. '올바르지 않은 코드'(컴파일 에러, 런타임 에러, 논리적 오류)를 생성할 수 있습니다.
    4. 다음 심화 주제에 집중하세요: ${randomTopic}.
    5. 다양성 확보: "출력 결과는 무엇인가?", "이 코드는 유효한가?", "어떤 개념이 사용되었는가?" 등을 적절히 섞어서 출제하세요.
    6. 모든 질문과 설명은 한국어로 작성되어야 합니다.
    7. 중요: 코드 내에 힌트나 정답을 암시하는 주석을 절대 달지 마세요.
    8. **매우 중요**: 질문 텍스트(questionText)에 해당 코드가 올바른지 틀린지 절대 미리 알려주지 마세요.
       - 나쁜 예: "이 코드의 컴파일 에러 원인은 무엇인가요?" (에러가 있다는 것을 알려줌)
       - 좋은 예: "이 코드의 실행 결과를 예측하거나, 문제가 있다면 설명하세요.", "이 코드는 문법적으로 올바른가요?"

    시험 범위 및 제약 사항:
    - **<vector> 헤더 및 std::vector는 시험 범위 밖이므로 절대 사용하지 마세요.**
    - **std::cerr 사용을 금지합니다. 모든 출력은 std::cout을 사용하세요.**
    - 배열이나 객체 배열을 다룰 때, 만약 경계 검사(Bound Check) 기능이 필요하다면 std::vector 대신 아래와 같은 커스텀 클래스 형태를 참고하여 구현된 코드를 제시하세요 (문제 의도에 맞게 필요시 수정 가능):
      \`\`\`cpp
      class BCA {
      private:
        int* arr;
        int arrlen;
      public:
        BCA(int len) : arrlen(len) { arr = new int[len]; }
        int& operator[] (int idx) {
          if(idx<0 || idx>= arrlen) { exit(1); }
          return arr[idx];
        }
        ~BCA(){ delete [] arr; }
      };
      \`\`\`
  `;

  try {
    const response = await generateContentWithRetry(ai.models, {
      model: MODEL_NAME,
      contents: `Generate a unique C++ question about: ${randomTopic}. The question text must be neutral and in Korean. Do NOT use vector header. Do NOT use cerr.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: questionSchema,
        temperature: 0.8, // Slight creativity for code variety
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    const question = JSON.parse(text) as CppQuestion;
    
    // Post-processing: Ensure no comments exist in the code to prevent leaking hints
    question.code = stripComments(question.code);
    
    return question;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};

export const evaluateAnswer = async (
  apiKey: string,
  question: CppQuestion,
  userAnswer: string
): Promise<EvaluationResult> => {
  if (!apiKey) throw new Error("API Key is missing");
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    당신은 엄격하지만 친절한 C++ 튜터입니다.
    사용자가 제출한 C++ 문제에 대한 답을 평가하세요.
    
    제공된 코드:
    ${question.code}
    
    질문:
    ${question.questionText}
    
    주제:
    ${question.topic}
    
    모든 피드백과 설명은 한국어로 제공하세요.
    사용자가 문제의 핵심(유효성 여부, 출력값 등)을 정확히 파악했는지 판단하세요.
  `;

  try {
    const response = await generateContentWithRetry(ai.models, {
      model: MODEL_NAME,
      contents: `User Answer: "${userAnswer}". Evaluate this answer in Korean. Provide detailed feedback explaining the specific C++ mechanics (stack, heap, vtable, compiler rules, etc.) involved.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: evaluationSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as EvaluationResult;
  } catch (error) {
    console.error("Gemini Evaluation Error:", error);
    throw error;
  }
};
