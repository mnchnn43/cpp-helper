import React, { useState, useEffect, useRef } from 'react';
import { generateQuestion, evaluateAnswer, validateApiKey } from './services/geminiService';
import { CppQuestion, EvaluationResult, SavedMistake, CPP_TOPICS } from './types';
import { CodeBlock } from './components/CodeBlock';
import { Loader2, AlertCircle, CheckCircle, XCircle, BookOpen, RotateCcw, Trash2, ArrowRight, Zap, Search, Filter, Settings, Key, Download, Upload, User, Info, Check } from 'lucide-react';

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
    if (storedKey) setApiKey(storedKey);

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
      if (valid) {
        localStorage.setItem('gemini_api_key', apiKey); // Auto save if valid
      }
    } catch (e) {
      setIsKeyValid(false);
    } finally {
      setIsCheckingKey(false);
    }
  };

  const handleSaveSettings = () => {
    // We allow saving even if not validated, but warn if invalid
    if (isKeyValid === false) {
      if (!confirm("API 키가 유효하지 않은 것으로 보입니다. 그래도 저장하시겠습니까?")) {
        return;
      }
    }
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('cpp_username', userName);
    setShowSettings(false);
    
    // Reset current question if key changed to force re-fetch or clear old state
    setCurrentQuestion(null);
    setUserAnswer('');
    setEvaluation(null);
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
            // Basic validation
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
      } else if (e.message?.includes('API key not valid') || e.message?.includes('400')) {
        setError("API Key가 올바르지 않습니다. 설정에서 키를 확인해주세요.");
      } else {
        setError("문제 생성에 실패했습니다. API 키나 네트워크 상태를 확인해주세요.");
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

  const filteredTopics = CPP_TOPICS.filter(t => 
    t.toLowerCase().includes(topicSearch.toLowerCase())
  );

  const renderSettingsModal = () => {
    if (!showSettings) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="text-blue-400" /> 사용자 설정
            </h3>
            <button onClick={() => apiKey ? setShowSettings(false) : alert('API Key를 입력해야 이용 가능합니다.')} className="text-slate-500 hover:text-white">
              <XCircle />
            </button>
          </div>
          
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-2 flex items-center gap-2">
                <User size={16} /> 사용자 이름
              </label>
              <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-400 mb-2 flex items-center gap-2">
                <Key size={16} /> Gemini API Key (필수)
              </label>
              <div className="flex gap-2">
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="AI Studio API Key 입력 (AIza...)"
                  className={`flex-1 bg-slate-800 border ${isKeyValid === false ? 'border-red-500' : isKeyValid === true ? 'border-emerald-500' : 'border-slate-700'} text-white px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm`}
                />
                <button 
                  onClick={handleTestKey}
                  disabled={isCheckingKey || !apiKey}
                  className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-colors flex items-center gap-2 ${
                    isKeyValid === true 
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {isCheckingKey ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : isKeyValid === true ? (
                    <><Check size={16} /> 확인됨</>
                  ) : (
                    "키 테스트"
                  )}
                </button>
              </div>
              
              {isKeyValid === false && (
                <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                  <AlertCircle size={12} /> 유효하지 않은 API Key입니다. 키를 다시 확인해주세요.
                </p>
              )}

              <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-3 mt-3 text-xs text-blue-200 space-y-2">
                <p className="flex items-start gap-2">
                  <Info size={14} className="mt-0.5 shrink-0 text-blue-400" />
                  <span>
                    <strong>Gemini Advanced(유료)와 API는 별개입니다.</strong><br/>
                    일반 API Key는 '무료 티어'로 동작하여 분당 요청 제한(RPM)이 있을 수 있습니다.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <Zap size={14} className="mt-0.5 shrink-0 text-yellow-400" />
                  <span>
                    앱이 자동으로 재시도하여 제한을 우회하려 노력하지만, 오류가 발생하면 잠시 기다려주세요.
                  </span>
                </p>
              </div>
              <p className="text-xs text-slate-500 mt-2 text-right">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                  Google AI Studio에서 키 발급받기 &rarr;
                </a>
              </p>
            </div>

            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
              <h4 className="text-sm font-bold text-slate-300 mb-3">데이터 백업 및 복원</h4>
              <div className="flex gap-3">
                <button 
                  onClick={handleExportData}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Download size={16} /> 백업 (JSON)
                </button>
                <label className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  <Upload size={16} /> 복원 (JSON)
                  <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
            <button 
              onClick={handleSaveSettings}
              disabled={!apiKey}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-2 rounded-lg font-bold transition-colors"
            >
              저장 및 닫기
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMenu = () => (
    <div className="max-w-5xl mx-auto pt-16 px-6 pb-20 animate-fade-in-up">
      <div className="flex justify-end mb-4">
        <button 
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 text-slate-400 hover:text-white bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700 transition-colors"
        >
          <Settings size={18} /> 
          {userName ? `${userName}님 설정` : "설정"}
        </button>
      </div>

      <div className="text-center mb-12">
        <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-6">
          C++ 시험준비도우미
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto break-keep">
          AI가 생성하는 무한한 C++ 예제로 실력을 테스트하세요. 
          포인터부터 템플릿까지, 원하는 주제를 선택하여 집중 공략할 수 있습니다.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 mb-12">
        {/* Topic Selection Section */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Filter className="text-blue-400" size={20} /> 학습 주제 선택
            </h3>
            <span className="text-xs text-slate-500 font-medium bg-slate-800 px-2 py-1 rounded-full border border-slate-700">
              {selectedTopics.length === 0 ? "전체 랜덤 (선택 안함)" : `${selectedTopics.length}개 선택됨`}
            </span>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 text-slate-500" size={18} />
            <input 
              type="text"
              placeholder="주제 검색 (예: 포인터, 상속, 가상함수...)"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 pl-10 pr-4 py-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-slate-600"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="flex flex-wrap gap-2 content-start">
              {filteredTopics.length > 0 ? filteredTopics.map((topic, i) => {
                const isSelected = selectedTopics.includes(topic);
                return (
                  <button
                    key={i}
                    onClick={() => toggleTopic(topic)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                      isSelected 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_10px_-2px_rgba(37,99,235,0.5)]' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {topic}
                  </button>
                );
              }) : (
                <div className="w-full text-center py-8 text-slate-600">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
             <span>* 주제를 선택하지 않으면 모든 범위에서 랜덤 출제됩니다.</span>
             {selectedTopics.length > 0 && (
               <button onClick={() => setSelectedTopics([])} className="text-red-400 hover:underline">
                 선택 초기화
               </button>
             )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4">
          <button 
            onClick={handleStartPractice}
            className="flex-1 group relative overflow-hidden bg-slate-800 hover:bg-slate-700 p-8 rounded-2xl border border-slate-700 transition-all hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] text-left flex flex-col justify-between"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <RotateCcw size={100} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <Zap className="text-blue-400" /> 실전 연습 시작
              </h3>
              <p className="text-slate-400 break-keep text-sm mt-2 leading-relaxed">
                {selectedTopics.length > 0 
                  ? `선택한 ${selectedTopics.length}개 주제를 기반으로 문제를 생성합니다.`
                  : "C++ 전체 범위에서 무작위로 문제를 생성합니다."}
              </p>
            </div>
            <div className="mt-6 flex items-center text-blue-400 font-bold text-sm group-hover:translate-x-1 transition-transform">
              시작하기 <ArrowRight size={16} className="ml-2" />
            </div>
          </button>

          <button 
            onClick={() => setMode(AppMode.REVIEW)}
            className="flex-1 group relative overflow-hidden bg-slate-800 hover:bg-slate-700 p-8 rounded-2xl border border-slate-700 transition-all hover:shadow-[0_0_40px_-10px_rgba(239,68,68,0.5)] text-left flex flex-col justify-between"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <AlertCircle size={100} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <BookOpen className="text-red-400" /> 오답 노트
              </h3>
              <p className="text-slate-400 break-keep text-sm mt-2">
                틀렸던 {mistakes.length}개의 문제를 다시 복습하여 약점을 보완하세요.
              </p>
            </div>
            <div className="mt-6 flex items-center text-red-400 font-bold text-sm group-hover:translate-x-1 transition-transform">
              복습하기 <ArrowRight size={16} className="ml-2" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  const renderPractice = () => (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setMode(AppMode.MENU)} className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
          &larr; 메뉴로 돌아가기
        </button>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${currentQuestion ? 'bg-blue-900/30 text-blue-400 border-blue-900' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
            {currentQuestion?.topic || '주제 선정 중...'}
          </span>
          {selectedTopics.length > 0 && (
             <span className="px-3 py-1 rounded-full text-xs font-bold border bg-slate-800 text-slate-400 border-slate-700" title="필터 적용됨">
               필터: {selectedTopics.length}개
             </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-96 animate-fade-in">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
            <Loader2 className="animate-spin text-blue-400 relative z-10" size={64} />
          </div>
          <p className="mt-8 text-slate-400 font-medium animate-pulse text-lg">AI가 새로운 C++ 문제를 출제하고 있습니다...</p>
          <p className="mt-2 text-slate-600 text-sm">복잡한 개념을 조합하는 중입니다. (잠시만 기다려주세요)</p>
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-800 text-red-200 p-6 rounded-xl flex flex-col items-center gap-4 text-center">
          <AlertCircle size={48} className="text-red-400" />
          <p>{error}</p>
          <button onClick={fetchNewQuestion} className="bg-red-900/50 hover:bg-red-900 text-white px-6 py-2 rounded-lg transition-colors">
            다시 시도
          </button>
        </div>
      ) : currentQuestion && (
        <div className="animate-fade-in-up">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-4 leading-relaxed">
              <span className="text-blue-400 mr-2">Q:</span> 
              {currentQuestion.questionText}
            </h2>
            <CodeBlock code={currentQuestion.code} />
          </div>

          {!evaluation ? (
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden">
              <label className="block text-slate-400 text-sm font-bold mb-2">
                답안 / 코드 분석 / 실행 결과 예측
              </label>
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                disabled={isEvaluating}
                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none mb-4 code-font text-sm disabled:opacity-50"
                placeholder="코드를 분석하여 답을 입력하세요. (예: '5번째 줄에서 메모리 누수가 발생합니다', '출력값은 10입니다' 등)"
              />
              <button
                onClick={handleSubmit}
                disabled={!userAnswer.trim() || isEvaluating}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-bold py-3 rounded-lg transition-all disabled:cursor-not-allowed flex justify-center items-center gap-2 h-12"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    <span className="animate-pulse">AI 교수님이 채점 중입니다...</span>
                  </>
                ) : (
                  <>
                    제출하기 <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className={`p-6 rounded-xl border mb-6 shadow-lg transition-all ${evaluation.isCorrect ? 'bg-emerald-900/20 border-emerald-800' : 'bg-red-900/20 border-red-800'}`}>
              <div className="flex items-center gap-3 mb-4">
                {evaluation.isCorrect ? (
                  <CheckCircle className="text-emerald-400" size={28} />
                ) : (
                  <XCircle className="text-red-400" size={28} />
                )}
                <h3 className={`text-xl font-bold ${evaluation.isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                  {evaluation.isCorrect ? '정답입니다!' : '틀렸습니다.'}
                </h3>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h4 className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
                    <div className="w-1 h-1 bg-slate-400 rounded-full"></div> 상세 피드백
                  </h4>
                  <p className="text-slate-200 leading-relaxed whitespace-pre-line break-keep bg-slate-900/30 p-4 rounded-lg border border-slate-700/50">
                    {evaluation.feedback}
                  </p>
                </div>
                
                {!evaluation.isCorrect && (
                   <div>
                   <h4 className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
                     <div className="w-1 h-1 bg-slate-400 rounded-full"></div> 모범 답안
                   </h4>
                   <p className="text-slate-300 font-mono bg-slate-950 p-4 rounded-lg border border-slate-800 break-keep text-sm">
                     {evaluation.correctAnswerDetail}
                   </p>
                 </div>
                )}
              </div>

              <button
                onClick={fetchNewQuestion}
                className="mt-8 w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2 group"
              >
                다음 문제 도전 <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderReview = () => (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <button onClick={() => setMode(AppMode.MENU)} className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
          &larr; 메뉴로 돌아가기
        </button>
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="text-red-400" /> 오답 노트
          </h2>
          <button onClick={() => setShowSettings(true)} className="text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-700 transition-colors">
            백업/복원
          </button>
        </div>
      </div>

      {mistakes.length === 0 ? (
        <div className="text-center py-24 bg-slate-800/30 rounded-2xl border border-slate-800 border-dashed">
          <CheckCircle size={64} className="mx-auto text-emerald-500 mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-slate-300">아직 오답이 없습니다!</h3>
          <p className="text-slate-500 mt-2">훌륭합니다. 실력을 확인하러 연습을 시작해보세요.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {mistakes.map((mistake) => (
            <div key={mistake.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg hover:border-slate-600 transition-colors">
              <div className="bg-slate-900/50 p-4 border-b border-slate-700 flex justify-between items-start">
                <div>
                  <div className="flex gap-2 items-center mb-2">
                    <span className="bg-red-500/10 text-red-400 text-xs px-2 py-0.5 rounded border border-red-500/20 font-bold">
                       {mistake.topic}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {new Date(mistake.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-white font-semibold">{mistake.questionText}</h3>
                </div>
                <button 
                  onClick={() => removeMistake(mistake.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-red-900/20 rounded-full"
                  title="오답 노트에서 삭제"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="p-0">
                <CodeBlock code={mistake.code} />
              </div>

              <div className="p-6 bg-slate-800/80">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-red-400 text-xs font-bold uppercase mb-2 flex items-center gap-1">
                      <XCircle size={12} /> 제출한 답안
                    </h4>
                    <p className="text-slate-300 text-sm bg-red-900/10 p-3 rounded border border-red-900/20 break-keep">
                      {mistake.userWrongAnswer}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-emerald-400 text-xs font-bold uppercase mb-2 flex items-center gap-1">
                      <CheckCircle size={12} /> 피드백
                    </h4>
                    <p className="text-slate-300 text-sm bg-emerald-900/10 p-3 rounded border border-emerald-900/20 break-keep">
                      {mistake.feedback}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      {renderSettingsModal()}
      {mode === AppMode.MENU && renderMenu()}
      {mode === AppMode.PRACTICE && renderPractice()}
      {mode === AppMode.REVIEW && renderReview()}
    </div>
  );
};

export default App;