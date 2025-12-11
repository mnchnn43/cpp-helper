import React, { useState, useEffect, useRef } from 'react';
import { generateQuestion, evaluateAnswer, validateApiKey } from './services/geminiService';
import { CppQuestion, EvaluationResult, SavedMistake, CPP_TOPICS } from './types';
import { CodeBlock } from './components/CodeBlock';
import { Loader2, AlertCircle, CheckCircle, XCircle, BookOpen, RotateCcw, Trash2, ArrowRight, Zap, Search, Filter, Settings, Key, Download, Upload, User, Info, Check, Menu } from 'lucide-react';

enum AppMode {
  MENU,
  PRACTICE,
  REVIEW,
}

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.MENU);
  const [mistakes, setMistakes] = useState<SavedMistake[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  
  // User Config State
  const [apiKey, setApiKey] = useState('');
  const [userName, setUserName] = useState('');
  
  // Key Validation State
  const [isKeyValid, setIsKeyValid] = useState<boolean | null>(null); // null = not checked, true = valid, false = invalid
  const [isCheckingKey, setIsCheckingKey] = useState(false);

  // Selection State
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState('');

  // Practice State
  const [currentQuestion, setCurrentQuestion] = useState<CppQuestion | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data from local storage on mount
  useEffect(() => {
    const storedMistakes = localStorage.getItem('cpp_mistakes');
    if (storedMistakes) setMistakes(JSON.parse(storedMistakes));

    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    }

    const storedName = localStorage.getItem('cpp_username');
    if (storedName) setUserName(storedName);
    
    // Auto open settings if no key
    if (!storedKey) {
      setShowSettings(true);
    }
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setIsKeyValid(null); // Reset validation status when key changes
  };

  const handleTestKey = async () => {
    if (!apiKey) return;
    setIsCheckingKey(true);
    try {
      const valid = await validateApiKey(apiKey);
      setIsKeyValid(valid);
    } catch (e) {
      setIsKeyValid(false);
    } finally {
      setIsCheckingKey(false);
    }
  };

  const handleSaveSettings = () => {
    if (isKeyValid !== true) {
      alert("API 키 테스트를 통과해야 저장할 수 있습니다.");
      return;
    }
    
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('cpp_username', userName);
    setShowSettings(false);
    
    // Reset current question if key changed to force re-fetch or clear old state
    setCurrentQuestion(null);
    setUserAnswer('');
    setEvaluation(null);
    setError(null);
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify(mistakes, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cpp_mistakes_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (event.target.files && event.target.files[0]) {
      fileReader.readAsText(event.target.files[0], "UTF-8");
      fileReader.onload = (e) => {
        if (e.target?.result) {
          try {
            const parsed = JSON.parse(e.target.result as string);
            if (Array.isArray(parsed)) {
              setMistakes(parsed);
              localStorage.setItem('cpp_mistakes', JSON.stringify(parsed));
              alert("데이터가 성공적으로 복원되었습니다.");
            } else {
              alert("올바르지 않은 파일 형식입니다.");
            }
          } catch (err) {
            alert("파일을 읽는 중 오류가 발생했습니다.");
          }
        }
      };
    }
  };

  const saveMistake = (question: CppQuestion, answer: string, feedback: string) => {
    const newMistake: SavedMistake = {
      ...question,
      id: Date.now().toString(),
      userWrongAnswer: answer,
      feedback: feedback,
      timestamp: Date.now(),
    };
    const updated = [newMistake, ...mistakes];
    setMistakes(updated);
    localStorage.setItem('cpp_mistakes', JSON.stringify(updated));
  };

  const removeMistake = (id: string) => {
    const updated = mistakes.filter(m => m.id !== id);
    setMistakes(updated);
    localStorage.setItem('cpp_mistakes', JSON.stringify(updated));
  };

  const handleStartPractice = () => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    if (!apiKey.startsWith("AIza")) {
      alert("API Key 형식이 올바르지 않습니다. 설정을 확인해주세요.");
      setShowSettings(true);
      return;
    }
    setMode(AppMode.PRACTICE);
    fetchNewQuestion();
  };

  const fetchNewQuestion = async () => {
    if (!apiKey) {
      setError("API Key가 설정되지 않았습니다. 설정 메뉴에서 키를 입력해주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setEvaluation(null);
    setUserAnswer('');
    setCurrentQuestion(null); 
    
    try {
      const q = await generateQuestion(apiKey, selectedTopics);
      setCurrentQuestion(q);
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes('429') || e.message?.includes('Resource has been exhausted')) {
        setError("무료 API 사용량 제한(분당 요청 수)에 도달했습니다. 잠시 후 다시 시도해주세요.");
      } else if (e.message?.includes('API Key format') || e.message?.includes('API key not valid') || e.message?.includes('400')) {
        setError("API Key가 올바르지 않습니다. 설정에서 키를 확인해주세요.");
        setTimeout(() => setShowSettings(true), 2000);
      } else {
        setError("문제 생성에 실패했습니다. 키를 다시 확인하거나 네트워크를 점검하세요.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentQuestion || !userAnswer.trim()) return;
    
    setIsEvaluating(true);
    try {
      const result = await evaluateAnswer(apiKey, currentQuestion, userAnswer);
      setEvaluation(result);
      if (!result.isCorrect) {
        saveMistake(currentQuestion, userAnswer, result.feedback);
      }
    } catch (e: any) {
      if (e.message?.includes('429') || e.message?.includes('Resource has been exhausted')) {
        setError("무료 API 사용량 제한에 도달했습니다. 잠시 대기 후 다시 시도해주세요.");
      } else {
        setError("답변 평가에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setIsEvaluating(false);
    }
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => 
      prev.includes(topic) 
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    );
  };

  // Filter topics for menu
  const filteredTopics = CPP_TOPICS.filter(t => t.toLowerCase().includes(topicSearch.toLowerCase()));

  return (
    <div className="min-h-screen flex flex-col items-center p-2 sm:p-4 md:p-6 lg:p-8 bg-[#0f172a]">
      <div className="w-full max-w-3xl flex flex-col gap-4 md:gap-6">
        
        {/* Header - Mobile Friendly */}
        <header className="flex justify-between items-center mb-1 md:mb-4 sticky top-0 bg-[#0f172a]/90 backdrop-blur-sm z-20 py-2">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            <h1 className="text-xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent cursor-pointer truncate" onClick={() => setMode(AppMode.MENU)}>
              C++ 시험준비
            </h1>
            {userName && <span className="text-slate-400 text-xs md:text-sm hidden sm:inline truncate">| {userName}님</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button 
              onClick={() => setMode(AppMode.REVIEW)} 
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors relative"
              title="오답 노트"
            >
              <BookOpen className="w-5 h-5 md:w-6 md:h-6" />
              {mistakes.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
                  {mistakes.length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setShowSettings(true)} 
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="설정"
            >
              <Settings className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full">
          {mode === AppMode.MENU && (
            <div className="flex flex-col gap-4 md:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-8 shadow-2xl text-center">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-6 h-6 md:w-8 md:h-8" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-2">무한 C++ 실전 연습</h2>
                <p className="text-sm md:text-base text-slate-400 mb-6 max-w-lg mx-auto">
                  Gemini AI가 생성하는 무제한의 C++ 문제를 통해 개념을 확실히 다지세요.<br className="hidden md:block"/>
                  코드의 유효성을 판단하고 결과를 예측해보세요.
                </p>
                <button 
                  onClick={handleStartPractice}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl font-bold text-base md:text-lg transition-all transform active:scale-95 md:hover:scale-105 shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 mx-auto"
                >
                  실전 연습 시작
                  <ArrowRight className="w-5 h-5" />
                  {selectedTopics.length > 0 && <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full ml-1 whitespace-nowrap">{selectedTopics.length}</span>}
                </button>
              </div>

              {/* Topic Selection */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base md:text-lg font-bold text-white">시험 범위 <span className="text-xs font-normal text-slate-500">(미선택시 전체)</span></h3>
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="주제 검색..." 
                      value={topicSearch}
                      onChange={(e) => setTopicSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 max-h-56 md:max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  {filteredTopics.map((topic) => {
                    const isSelected = selectedTopics.includes(topic);
                    return (
                      <button
                        key={topic}
                        onClick={() => toggleTopic(topic)}
                        className={`px-3 py-1.5 rounded-full text-xs md:text-sm font-medium transition-all duration-200 border flex-shrink-0 text-left ${
                          isSelected 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-900/20' 
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                        }`}
                      >
                        {topic}
                        {isSelected && <Check className="inline-block w-3 h-3 ml-1" />}
                      </button>
                    );
                  })}
                  {filteredTopics.length === 0 && (
                    <p className="text-slate-500 text-sm py-4 w-full text-center">검색 결과가 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.PRACTICE && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300 w-full pb-10">
              <button onClick={() => setMode(AppMode.MENU)} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 w-fit text-sm py-1">
                ← 메뉴로 돌아가기
              </button>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="text-sm md:text-base">
                    <p className="font-bold">오류 발생</p>
                    <p className="opacity-90">{error}</p>
                  </div>
                </div>
              )}

              {isLoading && !currentQuestion ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                  <p className="animate-pulse text-sm md:text-base">새로운 C++ 문제를 생성하고 있습니다...</p>
                </div>
              ) : currentQuestion ? (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="inline-block w-fit px-2 py-1 rounded bg-slate-800 text-slate-400 text-xs font-mono">
                      {currentQuestion.topic}
                    </span>
                    <h3 className="text-base md:text-xl font-semibold text-white leading-relaxed">
                      {currentQuestion.questionText}
                    </h3>
                  </div>

                  <CodeBlock code={currentQuestion.code} />

                  {!evaluation ? (
                    <div className="bg-slate-900 rounded-xl p-4 md:p-6 border border-slate-800 shadow-lg">
                      <label className="block text-sm font-medium text-slate-400 mb-2">
                        답안 입력
                      </label>
                      <textarea 
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="실행 결과, 혹은 코드가 유효하지 않은 이유를 서술하세요."
                        className="w-full h-32 md:h-40 bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm md:text-base text-slate-200 focus:outline-none focus:border-blue-500 transition-colors resize-none mb-4"
                        style={{ fontSize: '16px' }} // Prevent iOS zoom
                      />
                      <button 
                        onClick={handleSubmit}
                        disabled={isEvaluating || !userAnswer.trim()}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-3 md:py-3.5 rounded-lg font-bold transition-colors flex justify-center items-center gap-2 active:scale-[0.98]"
                      >
                        {isEvaluating ? <Loader2 className="w-5 h-5 animate-spin" /> : "제출 및 채점"}
                      </button>
                    </div>
                  ) : (
                    <div className={`rounded-xl p-4 md:p-6 border shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-500 ${evaluation.isCorrect ? 'bg-green-900/10 border-green-500/20' : 'bg-red-900/10 border-red-500/20'}`}>
                      <div className="flex items-center gap-3 mb-4">
                        {evaluation.isCorrect ? (
                          <CheckCircle className="w-6 h-6 md:w-8 md:h-8 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-6 h-6 md:w-8 md:h-8 text-red-500 flex-shrink-0" />
                        )}
                        <h3 className={`text-lg md:text-xl font-bold ${evaluation.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                          {evaluation.isCorrect ? '정답입니다!' : '오답입니다.'}
                        </h3>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="bg-slate-950/50 p-3 md:p-4 rounded-lg">
                          <p className="text-xs md:text-sm text-slate-400 mb-1 font-bold">내 답안</p>
                          <p className="text-slate-200 text-sm md:text-base">{userAnswer}</p>
                        </div>
                        
                        <div>
                          <p className="text-xs md:text-sm text-slate-400 mb-1 font-bold">피드백</p>
                          <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-sm md:text-base">{evaluation.feedback}</p>
                        </div>

                        {!evaluation.isCorrect && (
                          <div className="bg-blue-900/20 p-3 md:p-4 rounded-lg border border-blue-500/20">
                            <p className="text-xs md:text-sm text-blue-400 mb-1 font-bold">정답 해설</p>
                            <p className="text-slate-200 text-sm md:text-base">{evaluation.correctAnswerDetail}</p>
                          </div>
                        )}
                      </div>

                      <button 
                        onClick={fetchNewQuestion}
                        className="mt-6 w-full bg-slate-800 hover:bg-slate-700 text-white py-3 md:py-3.5 rounded-lg font-bold transition-colors flex justify-center items-center gap-2 active:scale-[0.98]"
                      >
                        다음 문제 풀기 <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {mode === AppMode.REVIEW && (
            <div className="flex flex-col gap-4 md:gap-6 animate-in fade-in duration-300 pb-10">
               <div className="flex justify-between items-center">
                <button onClick={() => setMode(AppMode.MENU)} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 py-1 text-sm md:text-base">
                  ← 메뉴로 돌아가기
                </button>
                <h2 className="text-xl md:text-2xl font-bold text-white">오답 노트</h2>
              </div>

              {mistakes.length === 0 ? (
                <div className="text-center py-20 text-slate-500 bg-slate-900 rounded-2xl border border-slate-800">
                  <BookOpen className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-4 opacity-50" />
                  <p>아직 저장된 오답이 없습니다.</p>
                  <p className="text-xs md:text-sm mt-2">틀린 문제는 자동으로 이곳에 저장됩니다.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:gap-6">
                  {mistakes.map((mistake) => (
                    <div key={mistake.id} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-lg">
                      <div className="p-3 md:p-4 bg-slate-800/50 flex justify-between items-center border-b border-slate-800">
                        <span className="text-xs text-slate-400 font-mono">{new Date(mistake.timestamp).toLocaleDateString()}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] md:text-xs bg-slate-700 px-2 py-1 rounded text-slate-300 truncate max-w-[80px] md:max-w-[120px]">{mistake.topic}</span>
                          <button onClick={() => removeMistake(mistake.id)} className="text-slate-500 hover:text-red-400 p-2">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4 md:p-6">
                         <p className="text-base md:text-lg text-white font-medium mb-4">{mistake.questionText}</p>
                         <div className="mb-4">
                           <CodeBlock code={mistake.code} />
                         </div>
                         <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-red-900/10 p-3 rounded border border-red-500/10">
                              <p className="text-xs text-red-400 font-bold mb-1">내 오답</p>
                              <p className="text-sm text-slate-300">{mistake.userWrongAnswer}</p>
                            </div>
                            <div className="bg-green-900/10 p-3 rounded border border-green-500/10">
                              <p className="text-xs text-green-400 font-bold mb-1">피드백</p>
                              <p className="text-sm text-slate-300 whitespace-pre-wrap">{mistake.feedback}</p>
                            </div>
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Settings Modal - Responsive with Scroll */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-2 sticky top-0 bg-slate-900 pb-2 z-10">
                <Settings className="w-6 h-6" /> 설정
              </h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">사용자 이름</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="이름을 입력하세요"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-base text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2 flex flex-wrap justify-between gap-1">
                    Gemini API Key 
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400 text-xs hover:underline flex items-center gap-1">
                      키 발급받기 <ArrowRight className="w-3 h-3" />
                    </a>
                  </label>
                  <div className="space-y-2">
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="password" 
                        value={apiKey}
                        onChange={handleApiKeyChange}
                        placeholder="AIza..."
                        className={`w-full bg-slate-950 border rounded-lg pl-10 pr-24 py-2.5 text-base text-slate-200 focus:outline-none transition-colors ${
                          isKeyValid === false ? 'border-red-500' : isKeyValid === true ? 'border-green-500' : 'border-slate-700 focus:border-blue-500'
                        }`}
                      />
                      <button
                        onClick={handleTestKey}
                        disabled={!apiKey || isCheckingKey}
                        className="absolute right-1 top-1 bottom-1 px-3 bg-slate-800 hover:bg-slate-700 text-xs rounded text-slate-300 disabled:opacity-50 transition-colors"
                      >
                        {isCheckingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : '키 테스트'}
                      </button>
                    </div>
                    {isKeyValid === true && (
                      <p className="text-green-500 text-xs flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> 유효한 API Key입니다.
                      </p>
                    )}
                    {isKeyValid === false && (
                      <p className="text-red-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> API Key가 유효하지 않거나 모델 접근 권한이 없습니다.
                      </p>
                    )}
                    <div className="bg-slate-800/50 p-3 rounded text-xs text-slate-400 space-y-1">
                      <p className="flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 flex-shrink-0" /> Gemini Advanced 구독과 API 사용량은 별개입니다.</p>
                      <p>API 무료 등급은 분당 요청 횟수가 제한될 수 있습니다.</p>
                      <p>키는 브라우저 로컬 스토리지에만 저장됩니다.</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-6">
                  <label className="block text-sm font-medium text-slate-400 mb-2">데이터 백업 및 복원</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button 
                      onClick={handleExportData}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors active:scale-95"
                    >
                      <Download className="w-4 h-4" /> 내보내기
                    </button>
                    <label className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95">
                      <Upload className="w-4 h-4" /> 가져오기
                      <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 pt-0 mt-auto bg-slate-900 border-t border-slate-800/50 sticky bottom-0 rounded-b-2xl">
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  onClick={handleSaveSettings}
                  disabled={isKeyValid !== true}
                  className={`w-full sm:w-auto px-6 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
                    isKeyValid === true
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  저장 및 시작
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;