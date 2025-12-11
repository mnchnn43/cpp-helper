
export type QuestionType = 'validity' | 'output' | 'concept';

export interface CppQuestion {
  code: string;
  questionText: string;
  type: QuestionType;
  topic: string;
  difficulty: string;
}

export interface EvaluationResult {
  isCorrect: boolean;
  feedback: string;
  correctAnswerDetail: string;
}

export interface SavedMistake extends CppQuestion {
  id: string;
  userWrongAnswer: string;
  feedback: string;
  timestamp: number;
}

export const CPP_TOPICS = [
  "변수 정의 및 유효 범위 (Scope)",
  "반복문 (for, while, do-while)",
  "조건문 (if, switch)",
  "함수 및 재귀 (Functions & Recursion)",
  "구조체 (Structs)",
  "포인터 및 배열 (Pointers & Arrays)",
  "참조자 (Reference Types)",
  "클래스 (멤버 변수/함수)",
  "상속 및 다형성 (Inheritance & Polymorphism)",
  "깊은 복사 vs 얕은 복사 (Deep vs Shallow Copy)",
  "복사 생성자 및 대입 연산자",
  "템플릿 (함수 및 클래스)",
  "이름공간 (Namespaces)",
  "동적 할당 및 메모리 관리 (New/Delete)",
  "상수화 (Const Correctness - 변수 및 함수)",
  "캡슐화 (private, protected, public)",
  "객체 배열 (Object Arrays)",
  "자기 참조 및 this 포인터",
  "friend 선언 (Friend Functions/Classes)",
  "정적 멤버 (Static Members)",
  "문자열 처리 (strcpy, strlen vs std::string)",
  "bool 형의 특성",
  "생성자/소멸자 호출 순서 (Stack 구조)",
  "값에 의한 호출 vs 참조에 의한 호출 (Call by Value/Ref)",
  "가상 함수 및 가상 함수 테이블 (V-Table)",
  "순수 가상 함수 및 추상 클래스",
  "가상 소멸자 (Virtual Destructors)",
  "연산자 오버로딩 (Operator Overloading)",
  "스마트 포인터 (unique_ptr, shared_ptr)",
  "함수 객체 (Functors)",
  "예외 처리 (try, throw, catch)",
  "RAII 및 예외 안전성"
];
