"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, GitBranch, Bot, FolderCode, Info, Menu, Check, X, Download, ClipboardList, AlertTriangle, Link2, CircleDot, Shuffle, Search, FlaskConical, Target, Lightbulb, Cog, UserCheck, Wrench, ArrowRight } from "lucide-react";
import HeroSection from "./components/HeroSection";
import Terminal from "./components/Terminal";
import DependencyGraph from "./components/DependencyGraph";
import MetricCards from "./components/MetricCards";
import AgentMonitor from "./components/AgentMonitor";

// ─── Types ───────────────────────────────────────────────────────────────────
interface RiskScore { level: string; score: number; reasoning: string }
interface ABAPObject { name: string; type: string; module: string; tables_used: string[]; calls: string[]; performs: string[]; description: string }
interface AffectedObject { object: ABAPObject; risk: RiskScore; blast_radius: number; path: string[] }
interface ImpactReport { change_request: string; affected_objects: AffectedObject[]; risk_summary: Record<string,number>; total_affected: number; time_saved_weeks: number; cost_saved_estimate: number }
interface TestCase { name: string; type: string; target_object: string; abap_code: string; description: string; priority: number }
interface TestSuite { test_cases: TestCase[]; coverage_percent: number; affected_objects_count: number }
interface GraphNode { id: string; name: string; group: string; x: number; y: number; size: number }
interface GraphData { nodes: GraphNode[]; edges: { source: string; target: string }[]; clusters: Record<string,string[]> }
interface AgentStatus { name: string; status: string; progress: number; message: string; duration_ms: number|null }
interface AnalysisResult { impact_report: ImpactReport; test_suite: TestSuite; graph_data: GraphData; agent_statuses: AgentStatus[]; pipeline_duration_ms: number; objects_parsed: number }
interface LogEntry { timestamp: number; agent: string; message: string }

const API = "http://localhost:8000";
const RISK_COLORS: Record<string,string> = { CRITICAL:"#ef4444", HIGH:"#f97316", MEDIUM:"#eab308", LOW:"#22c55e" };
const MODULE_COLORS: Record<string,string> = { HR:"#3b82f6", SD:"#22c55e", MM:"#f97316", FI:"#a855f7" };

const NAV_ICONS: Record<string, React.ReactNode> = {
  analysis: <Zap size={16} />,
  graph: <GitBranch size={16} />,
  agents: <Bot size={16} />,
  codebase: <FolderCode size={16} />,
  about: <Info size={16} />,
};
const NAV_ITEMS = [
  { id:"analysis", label:"Analysis",  desc:"Run impact analysis" },
  { id:"graph",    label:"Graph",     desc:"Dependency visualization" },
  { id:"agents",   label:"Agents",    desc:"Swarm monitor" },
  { id:"codebase", label:"Codebase",  desc:"ABAP explorer" },
  { id:"about",    label:"About",     desc:"Project details" },
] as const;
type Tab = typeof NAV_ITEMS[number]["id"];

// ─── Mock data for offline mode ──────────────────────────────────────────────
const MOCK_MODULES: Record<string, {name:string;type:string;description:string}[]> = {
  HR:[
    {name:"ZHR_EMPLOYEE_MASTER",type:"REPORT",description:"Employee master data maintenance"},
    {name:"ZHR_PAYROLL_CALC",type:"FUNCTION_MODULE",description:"Payroll calculation engine"},
    {name:"ZHR_ORG_STRUCTURE",type:"FUNCTION_MODULE",description:"Organizational hierarchy"},
    {name:"ZHR_TIME_MGMT",type:"FUNCTION_MODULE",description:"Time management & attendance"},
    {name:"ZHR_BENEFITS",type:"REPORT",description:"Benefits administration"},
  ],
  SD:[
    {name:"ZSD_ORDER_PROCESS",type:"REPORT",description:"Sales order creation"},
    {name:"ZSD_PRICING_ENGINE",type:"FUNCTION_MODULE",description:"Pricing determination"},
    {name:"ZSD_DELIVERY_CREATE",type:"FUNCTION_MODULE",description:"Outbound delivery creation"},
    {name:"ZSD_BILLING_DOC",type:"REPORT",description:"Billing document creation"},
    {name:"ZSD_CREDIT_CHECK",type:"FUNCTION_MODULE",description:"Credit limit validation"},
  ],
  MM:[
    {name:"ZMM_PURCHASE_ORDER",type:"REPORT",description:"Purchase order creation"},
    {name:"ZMM_GOODS_RECEIPT",type:"FUNCTION_MODULE",description:"Goods receipt processing"},
    {name:"ZMM_INVOICE_VERIFY",type:"REPORT",description:"Invoice verification"},
    {name:"ZMM_INVENTORY_MGMT",type:"FUNCTION_MODULE",description:"Inventory management"},
  ],
};

const MOCK_RESULT: AnalysisResult = {
  objects_parsed: 14,
  pipeline_duration_ms: 1847,
  agent_statuses: [
    {name:"CodeArchaeologist",status:"complete",progress:100,message:"Parsed 14 objects",duration_ms:312},
    {name:"ImpactAnalyzer",status:"complete",progress:100,message:"8 objects affected, 3 critical",duration_ms:1102},
    {name:"TestGenerator",status:"complete",progress:100,message:"12 tests, 100% coverage",duration_ms:433},
  ],
  impact_report: {
    change_request:"Add GDPR data erasure capabilities to the HR module",
    total_affected:8, time_saved_weeks:6.4, cost_saved_estimate:160000,
    risk_summary:{CRITICAL:3,HIGH:2,MEDIUM:2,LOW:1},
    affected_objects:[
      {object:{name:"ZHR_EMPLOYEE_MASTER",type:"REPORT",module:"HR",tables_used:["PA0001","PA0002"],calls:["ZHR_PAYROLL_CALC"],performs:[],description:"Employee master data maintenance"},risk:{level:"CRITICAL",score:9.5,reasoning:"Directly targeted. Accesses PA0001/PA0002 personal data. Blast radius: 7 objects."},blast_radius:7,path:["ZHR_EMPLOYEE_MASTER"]},
      {object:{name:"ZHR_PAYROLL_CALC",type:"FUNCTION_MODULE",module:"HR",tables_used:["PA0008","PA0041"],calls:["ZHR_TIME_MGMT"],performs:[],description:"Payroll calculation engine"},risk:{level:"CRITICAL",score:9.0,reasoning:"Compensation data PA0008 in scope. High centrality in dependency graph."},blast_radius:5,path:["ZHR_EMPLOYEE_MASTER","ZHR_PAYROLL_CALC"]},
      {object:{name:"ZHR_BENEFITS",type:"REPORT",module:"HR",tables_used:["PA0167","PA0169"],calls:["ZHR_EMPLOYEE_MASTER"],performs:[],description:"Benefits administration"},risk:{level:"CRITICAL",score:9.0,reasoning:"Health Plans PA0167, Savings PA0169 are personal data under GDPR."},blast_radius:4,path:["ZHR_EMPLOYEE_MASTER","ZHR_BENEFITS"]},
      {object:{name:"ZHR_TIME_MGMT",type:"FUNCTION_MODULE",module:"HR",tables_used:["PA2001","PA2002"],calls:["ZHR_EMPLOYEE_MASTER"],performs:[],description:"Time management"},risk:{level:"HIGH",score:7.5,reasoning:"Time data cross-referenced with employee. Indirect GDPR scope."},blast_radius:3,path:["ZHR_EMPLOYEE_MASTER","ZHR_PAYROLL_CALC","ZHR_TIME_MGMT"]},
      {object:{name:"ZHR_ORG_STRUCTURE",type:"FUNCTION_MODULE",module:"HR",tables_used:["HRP1000","HRP1001"],calls:[],performs:[],description:"Organizational hierarchy"},risk:{level:"HIGH",score:7.0,reasoning:"Org unit data linked to personal records."},blast_radius:2,path:["ZHR_EMPLOYEE_MASTER","ZHR_ORG_STRUCTURE"]},
      {object:{name:"ZSD_ORDER_PROCESS",type:"REPORT",module:"SD",tables_used:["VBAK","VBAP"],calls:["ZSD_CREDIT_CHECK"],performs:[],description:"Sales order creation"},risk:{level:"MEDIUM",score:5.0,reasoning:"Customer KNA1 cross-module reference to employee data."},blast_radius:4,path:["ZHR_EMPLOYEE_MASTER","ZSD_ORDER_PROCESS"]},
      {object:{name:"ZSD_CREDIT_CHECK",type:"FUNCTION_MODULE",module:"SD",tables_used:["KNA1","KNB1"],calls:[],performs:[],description:"Credit limit validation"},risk:{level:"MEDIUM",score:5.0,reasoning:"Customer personal data may require GDPR treatment."},blast_radius:1,path:["ZSD_ORDER_PROCESS","ZSD_CREDIT_CHECK"]},
      {object:{name:"ZMM_INVENTORY_MGMT",type:"FUNCTION_MODULE",module:"MM",tables_used:["MARA","MARD"],calls:[],performs:[],description:"Inventory management"},risk:{level:"LOW",score:2.5,reasoning:"Material data, not personal. Minimal GDPR relevance."},blast_radius:0,path:["ZSD_DELIVERY_CREATE","ZMM_INVENTORY_MGMT"]},
    ],
  },
  test_suite:{coverage_percent:100,affected_objects_count:8,test_cases:[
    {name:"UT_ZHR_EMPLOYEE_MASTER",type:"UNIT",target_object:"ZHR_EMPLOYEE_MASTER",priority:1,description:"Validates GDPR erasure logic and data integrity checks on PA0001/PA0002.",abap_code:"CLASS lcl_test_zhr_employee_master DEFINITION\n  FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.\n\n  PRIVATE SECTION.\n    METHODS:\n      setup,\n      test_gdpr_erasure    FOR TESTING,\n      test_data_integrity  FOR TESTING.\nENDCLASS.\n\nCLASS lcl_test_zhr_employee_master IMPLEMENTATION.\n  METHOD setup.\n    \" Prepare test fixtures\n  ENDMETHOD.\n\n  METHOD test_gdpr_erasure.\n    DATA: lv_count TYPE i.\n    SELECT COUNT(*) FROM PA0002 INTO lv_count\n      WHERE pernr = '00000001'.\n    cl_abap_unit_assert=>assert_differs(\n      act = lv_count  exp = 0\n      msg = 'Record must exist before GDPR erasure' ).\n  ENDMETHOD.\n\n  METHOD test_data_integrity.\n    DATA: lv_count TYPE i.\n    SELECT COUNT(*) FROM PA0001 INTO lv_count\n      WHERE endda >= sy-datum.\n    cl_abap_unit_assert=>assert_differs(\n      act = lv_count  exp = 0\n      msg = 'PA0001 must have active records' ).\n  ENDMETHOD.\nENDCLASS."},
    {name:"IT_ZHR_EMPLOYEE_MASTER",type:"INTEGRATION",target_object:"ZHR_EMPLOYEE_MASTER",priority:1,description:"End-to-end GDPR erasure across HR module — employee → payroll → time.",abap_code:"* Integration: GDPR Erasure Flow\n* Chain: ZHR_EMPLOYEE_MASTER → ZHR_PAYROLL_CALC → ZHR_TIME_MGMT\n\nCLASS lcl_integration_gdpr DEFINITION\n  FOR TESTING RISK LEVEL HARMLESS DURATION MEDIUM.\n\n  PRIVATE SECTION.\n    METHODS:\n      test_erasure_propagation FOR TESTING,\n      test_cascade_deletion    FOR TESTING.\nENDCLASS.\n\nCLASS lcl_integration_gdpr IMPLEMENTATION.\n  METHOD test_erasure_propagation.\n    CALL FUNCTION 'ZHR_PAYROLL_CALC' EXCEPTIONS OTHERS = 1.\n    cl_abap_unit_assert=>assert_equals(\n      act = sy-subrc  exp = 0\n      msg = 'Payroll must handle erased employee gracefully' ).\n  ENDMETHOD.\n\n  METHOD test_cascade_deletion.\n    DATA: lv_count TYPE i.\n    SELECT COUNT(*) FROM PA0002 INTO lv_count\n      WHERE pernr = '00000001'.\n    cl_abap_unit_assert=>assert_equals(\n      act = lv_count  exp = 0\n      msg = 'Personal data must be fully erased' ).\n  ENDMETHOD.\nENDCLASS."},
  ]},
  graph_data:{nodes:[],edges:[],clusters:{}},
};

const MOCK_LOGS: LogEntry[] = [
  {timestamp:0,agent:"Orchestrator",message:"Pipeline initializing — change request received"},
  {timestamp:.1,agent:"CodeArchaeologist",message:"Scanning 14 ABAP objects across HR, SD, MM modules..."},
  {timestamp:.3,agent:"CodeArchaeologist",message:"Extracting CALL FUNCTION / PERFORM / SELECT statements..."},
  {timestamp:.5,agent:"CodeArchaeologist",message:"Graph built: 14 nodes, 13 edges (density=0.071)"},
  {timestamp:.7,agent:"CodeArchaeologist",message:"PageRank centrality computed — ZHR_EMPLOYEE_MASTER: 0.312"},
  {timestamp:.9,agent:"CodeArchaeologist",message:"✓ Phase 1 complete in 312ms"},
  {timestamp:1.0,agent:"ImpactAnalyzer",message:"Interpreting: 'Add GDPR data erasure capabilities to the HR module'"},
  {timestamp:1.2,agent:"ImpactAnalyzer",message:"NLP extraction: targets=['HR','GDPR','erasure'] tables=['PA0001','PA0002','PA0167']"},
  {timestamp:1.4,agent:"ImpactAnalyzer",message:"BFS traversal: 8 affected objects found"},
  {timestamp:1.6,agent:"ImpactAnalyzer",message:"Risk scores: CRITICAL×3, HIGH×2, MEDIUM×2, LOW×1"},
  {timestamp:1.7,agent:"ImpactAnalyzer",message:"ROI: 6.4 weeks saved · £160,000 consulting costs avoided"},
  {timestamp:1.8,agent:"ImpactAnalyzer",message:"✓ Phase 2 complete in 1102ms"},
  {timestamp:1.9,agent:"TestGenerator",message:"Generating ABAP Unit test classes for 8 affected objects..."},
  {timestamp:2.1,agent:"TestGenerator",message:"Unit tests: 8 · Integration tests: 4 · Coverage: 100%"},
  {timestamp:2.3,agent:"TestGenerator",message:"✓ Phase 3 complete in 433ms"},
  {timestamp:2.4,agent:"Orchestrator",message:"✅ Pipeline complete in 1847ms — provider: regex_fallback"},
];

const EXAMPLE_REQUESTS = [
  "Add GDPR data erasure capabilities to the HR module",
  "Migrate SD pricing engine to S/4HANA standard pricing",
  "Add SOX compliance audit logging to financial postings",
  "Modify employee payroll calculation for new tax regulations",
  "Update purchase order approval workflow in MM module",
];

// ─── Risk Badge ──────────────────────────────────────────────────────────────
function RiskBadge({level}:{level:string}) {
  return <span className={`badge badge-${level.toLowerCase()}`}>{level}</span>;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [changeReq, setChangeReq] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult|null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [modules, setModules] = useState<Record<string, any[]>>({});
  const [selObj, setSelObj] = useState<string|null>(null);
  const [objCode, setObjCode] = useState("");
  const [expandedTest, setExpandedTest] = useState<number|null>(null);
  const [online, setOnline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [objectDecisions, setObjectDecisions] = useState<Record<string,"approved"|"rejected"|"pending">>({});

  useEffect(()=>{
    fetch(`${API}/api/health`).then(r=>r.json()).then(()=>setOnline(true)).catch(()=>setOnline(false));
    fetch(`${API}/api/codebase`).then(r=>r.json()).then(data=>{
      setModules(data.modules || {});
    }).catch(e=>console.error("Failed to load codebase:", e));
  },[]);

  const affectedNames = new Set(result?.impact_report.affected_objects.map(a=>a.object.name)||[]);

  // Initialize decisions when result changes
  useEffect(()=>{
    if(result){
      const decisions:Record<string,"approved"|"rejected"|"pending">={}
      result.impact_report.affected_objects.forEach(ao=>{decisions[ao.object.name]="pending";})
      setObjectDecisions(decisions);
    }
  },[result]);

  const toggleDecision=(name:string,decision:"approved"|"rejected")=>{
    setObjectDecisions(prev=>({...prev,[name]:prev[name]===decision?"pending":decision}));
  };

  const exportReport=()=>{
    if(!result) return;
    const approvedCount=Object.values(objectDecisions).filter(d=>d==="approved").length;
    const rejectedCount=Object.values(objectDecisions).filter(d=>d==="rejected").length;
    const pendingCount=Object.values(objectDecisions).filter(d=>d==="pending").length;
    let md=`# LegacyMind — Impact Analysis Report\n`;
    md+=`**Generated:** ${new Date().toISOString().slice(0,19).replace('T',' ')}\n\n`;
    md+=`---\n\n`;
    md+=`## Change Request\n> ${result.impact_report.change_request}\n\n`;
    md+=`## Summary\n`;
    md+=`| Metric | Value |\n|--------|-------|\n`;
    md+=`| Total Affected Objects | ${result.impact_report.total_affected} |\n`;
    md+=`| Time Saved | ${result.impact_report.time_saved_weeks} weeks |\n`;
    md+=`| Cost Saved | £${result.impact_report.cost_saved_estimate.toLocaleString()} |\n`;
    md+=`| Pipeline Duration | ${result.pipeline_duration_ms}ms |\n`;
    md+=`| Approved | ${approvedCount} |\n`;
    md+=`| Rejected | ${rejectedCount} |\n`;
    md+=`| Pending Review | ${pendingCount} |\n\n`;
    md+=`## Risk Distribution\n`;
    Object.entries(result.impact_report.risk_summary).forEach(([lvl,c])=>{md+=`- **${lvl}**: ${c}\n`;});
    md+=`\n## Affected Objects\n\n`;
    md+=`| Object | Module | Risk | Score | Decision |\n|--------|--------|------|-------|----------|\n`;
    result.impact_report.affected_objects.forEach(ao=>{
      const dec=objectDecisions[ao.object.name]||"pending";
      md+=`| ${ao.object.name} | ${ao.object.module} | ${ao.risk.level} | ${ao.risk.score.toFixed(1)} | ${dec.toUpperCase()} |\n`;
    });
    md+=`\n## Generated Test Suite\n`;
    md+=`- **Coverage:** ${result.test_suite.coverage_percent}%\n`;
    md+=`- **Test Cases:** ${result.test_suite.test_cases.length}\n\n`;
    result.test_suite.test_cases.forEach(tc=>{
      md+=`### ${tc.name} (${tc.type})\n`;
      md+=`${tc.description}\n\n`;
      md+=`\`\`\`abap\n${tc.abap_code}\n\`\`\`\n\n`;
    });
    md+=`---\n*Report generated by LegacyMind — AI-Powered Legacy System Modernization*\n`;
    const blob=new Blob([md],{type:"text/markdown"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`legacymind-report-${Date.now()}.md`;a.click();
    URL.revokeObjectURL(url);
  };

  const runAnalysis = async () => {
    if(!changeReq.trim()||analyzing) return;
    setAnalyzing(true); setResult(null); setLogs([]); setExpandedTest(null);
    setTab("analysis");

    const simulate = (ls: LogEntry[], res: AnalysisResult) => {
      let i=0;
      const iv=setInterval(()=>{
        if(i<ls.length){setLogs(prev=>[...prev,ls[i]]);i++;}
        else{clearInterval(iv);setResult(res);setAnalyzing(false);}
      },90);
    };

    try {
      const r = await fetch(`${API}/api/analyze`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({change_request:changeReq}),
      });
      if(!r.ok) throw new Error(`API error: ${r.status}`);
      const data: AnalysisResult = await r.json();
      const lr = await fetch(`${API}/api/agents/logs`);
      const ld: LogEntry[] = await lr.json();
      simulate(ld, data);
    } catch (e: any) {
      setAnalyzing(false);
      setLogs([{timestamp: Date.now(), agent: "System", message: `Connection failed: ${e.message}. Is backend running?`}]);
    }
  };

  const loadCode = async (name: string) => {
    setSelObj(name);
    try {
      const r = await fetch(`${API}/api/codebase/${name}`);
      const d = await r.json();
      setObjCode(typeof d.code === "string" ? d.code : "");
    } catch {
      setObjCode(`* ─── ${name} ───\n* (Backend offline — placeholder)\nREPORT ${name}.\n  WRITE: / 'Module: ${name}'.\n  WRITE: / 'Connect backend for full source.'`);
    }
  };

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"#ffffff"}}>

      {/* ════════ SIDEBAR ════════════════════════════════════════════════ */}
      <aside className="sidebar" style={{transform:sidebarOpen?"translateX(0)":"translateX(-100%)"}}>
        {/* Logo */}
        <div style={{padding:"24px 20px 20px",borderBottom:"1px solid rgba(0,0,0,0.05)"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <motion.div
              style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#f85018,#feac3e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,flexShrink:0,boxShadow:"0 4px 16px rgba(248,80,24,0.3)"}}
              whileHover={{scale:1.1,rotate:5}}
              transition={{type:"spring",stiffness:300}}
            >L</motion.div>
            <div>
              <div className="gradient-text" style={{fontSize:15,fontWeight:800,letterSpacing:"-0.01em"}}>LegacyMind</div>
              <div style={{fontSize:10,color:"rgba(0,0,0,0.6)",letterSpacing:"0.08em",marginTop:1}}>AI AGENT SWARM</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{flex:1,padding:"16px 0",overflowY:"auto"}}>
          <div style={{padding:"0 12px 8px",fontSize:10,color:"rgba(0,0,0,0.5)",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600}}>Navigation</div>
          {NAV_ITEMS.map(item=>(
            <motion.button key={item.id} onClick={()=>setTab(item.id as Tab)}
              className={`sidebar-nav-item${tab===item.id?" active":""}`}
              style={{width:"100%",border:"none",cursor:"pointer",textAlign:"left"}}
              whileHover={{x:4}} whileTap={{scale:0.98}}>
              <span className="nav-icon" style={{width:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{NAV_ICONS[item.id]}</span>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{item.label}</div>
                <div style={{fontSize:10,color:"rgba(0,0,0,0.6)",marginTop:1}}>{item.desc}</div>
              </div>
            </motion.button>
          ))}
        </nav>

        {/* Agent Status Panel */}
        <div style={{padding:"16px",borderTop:"1px solid rgba(0,0,0,0.05)"}}>
          <div style={{fontSize:10,color:"rgba(0,0,0,0.5)",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Agent Status</div>
          {(result?result.agent_statuses:[{name:"CodeArchaeologist",status:"idle",progress:0,message:"",duration_ms:null},{name:"ImpactAnalyzer",status:"idle",progress:0,message:"",duration_ms:null},{name:"TestGenerator",status:"idle",progress:0,message:"",duration_ms:null}]).map((a)=>{
            const colors:{[k:string]:string}={CodeArchaeologist:"#3b82f6",ImpactAnalyzer:"#f97316",TestGenerator:"#22c55e"};
            const col=colors[a.name]||"#8b5cf6";
            return(
              <div key={a.name} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:11,color:"rgba(0,0,0,0.5)",fontWeight:500}}>{a.name.replace("Code","").replace("Analyzer","Analyze").replace("Generator","Gen")}</span>
                  <span style={{fontSize:10,color:a.status==="complete"?"#22c55e":a.status==="running"?"#f85018":"rgba(0,0,0,0.5)",fontWeight:600,textTransform:"uppercase"}}>{a.status}</span>
                </div>
                <div className="progress-bar" style={{height:3}}>
                  <div className="progress-fill" style={{width:`${a.progress}%`,background:col}}/>
                </div>
              </div>
            );
          })}
          <div style={{marginTop:16,display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:10,background:"rgba(0,0,0,0.02)",border:"1px solid rgba(0,0,0,0.05)"}}>
            <div className={online?"status-online":"status-offline"}/>
            <span style={{fontSize:11,color:"rgba(0,0,0,0.6)"}}>{online?"API Connected":"Demo Mode"}</span>
          </div>
        </div>
      </aside>

      {/* ════════ MAIN ════════════════════════════════════════════════════ */}
      <div style={{marginLeft:sidebarOpen?260:0,flex:1,minHeight:"100vh",display:"flex",flexDirection:"column",transition:"margin-left .3s ease"}}>

        {/* Header */}
        <header style={{height:64,borderBottom:"1px solid rgba(0,0,0,0.05)",background:"rgba(255,255,255,0.85)",backdropFilter:"blur(20px)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",position:"sticky",top:0,zIndex:30,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <button onClick={()=>setSidebarOpen(p=>!p)} style={{background:"rgba(0,0,0,0.04)",border:"1px solid rgba(0,0,0,0.08)",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center"}}><Menu size={16} /></button>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"rgba(0,0,0,0.9)"}}>{NAV_ITEMS.find(n=>n.id===tab)?.label}</div>
              <div style={{fontSize:11,color:"rgba(0,0,0,0.6)"}}>{NAV_ITEMS.find(n=>n.id===tab)?.desc}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {result&&<motion.div initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} style={{padding:"4px 12px",borderRadius:20,background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.2)",fontSize:11,color:"#22c55e",fontWeight:600,display:"flex",alignItems:"center",gap:4}}><Check size={12} /> Analysis Ready</motion.div>}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderRadius:10,background:"rgba(0,0,0,0.03)",border:"1px solid rgba(0,0,0,0.06)"}}>
              <div className={online?"status-online":"status-offline"}/>
              <span style={{fontSize:12,color:"rgba(0,0,0,0.6)",fontWeight:500}}>{online?"Backend Online":"Offline Mode"}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="grid-bg" style={{flex:1,padding:"32px 28px",overflowY:"auto"}}>
          <AnimatePresence mode="wait">

          {/* ── ANALYSIS ───────────────────────────────────────────────── */}
          {tab==="analysis"&&(
            <motion.div key="analysis" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.35}} style={{maxWidth:1100,margin:"0 auto"}}>
              <HeroSection online={online} />

              {/* Input Card */}
              <motion.div className="glass-card" style={{padding:28,marginBottom:24}}
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.3}}>
                <label style={{fontSize:12,fontWeight:600,color:"rgba(0,0,0,0.6)",letterSpacing:"0.08em",textTransform:"uppercase",display:"block",marginBottom:12}}>Change Request</label>
                <textarea value={changeReq} onChange={e=>setChangeReq(e.target.value)} rows={3}
                  className="input-dark" placeholder="e.g. Add GDPR data erasure capabilities to the HR module..."
                  style={{marginBottom:14}}/>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:18}}>
                  {EXAMPLE_REQUESTS.map((ex,i)=>(
                    <motion.button key={i} onClick={()=>setChangeReq(ex)} className="btn-ghost"
                      whileHover={{scale:1.02}} whileTap={{scale:0.97}}>
                      {ex}
                    </motion.button>
                  ))}
                </div>
                <motion.button onClick={runAnalysis} disabled={analyzing||!changeReq.trim()} className="btn-primary"
                  style={{padding:"12px 32px",fontSize:14,borderRadius:12}}
                  whileHover={{scale:1.02}} whileTap={{scale:0.98}}>
                  {analyzing?<><svg style={{width:16,height:16,animation:"spin 1s linear infinite"}} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity=".25"/><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>Analyzing...</>:<><Zap size={14} /> Run Analysis</>}
                </motion.button>
              </motion.div>

              {/* Terminal */}
              {(logs.length>0||analyzing)&&<div style={{marginBottom:24}}><Terminal logs={logs} running={analyzing}/></div>}

              {/* Results */}
              {result&&(
                <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.5}}>
                  {/* KPI Row */}
                  <MetricCards
                    totalAffected={result.impact_report.total_affected}
                    timeSaved={result.impact_report.time_saved_weeks}
                    costSaved={result.impact_report.cost_saved_estimate}
                    objectsParsed={result.objects_parsed}
                  />

                  {/* Two-col: Risk + Duration */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:16,marginBottom:24}}>
                    <motion.div className="glass-card" style={{padding:24}}
                      initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{delay:0.2}}>
                      <div className="section-header">
                        <div className="section-title"><span className="icon-wrapper" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}><AlertTriangle size={14} /></span>Risk Distribution</div>
                      </div>
                      <div style={{height:10,borderRadius:9999,overflow:"hidden",display:"flex",gap:3,marginBottom:16}}>
                        {(["CRITICAL","HIGH","MEDIUM","LOW"] as const).map(lvl=>{
                          const c=result.impact_report.risk_summary[lvl]||0;
                          const p=(c/Math.max(result.impact_report.total_affected,1))*100;
                          if(!p) return null;
                          return <motion.div key={lvl} style={{width:`${p}%`,background:RISK_COLORS[lvl],borderRadius:9999}}
                            initial={{width:0}} animate={{width:`${p}%`}} transition={{duration:1,ease:"easeOut"}}/>;
                        })}
                      </div>
                      <div style={{display:"flex",gap:24}}>
                        {(["CRITICAL","HIGH","MEDIUM","LOW"] as const).map(lvl=>(
                          <div key={lvl} style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:10,height:10,borderRadius:"50%",background:RISK_COLORS[lvl],flexShrink:0}}/>
                            <span style={{fontSize:12,color:"rgba(0,0,0,0.6)"}}>{lvl} <strong style={{color:"rgba(0,0,0,0.75)"}}>{result.impact_report.risk_summary[lvl]||0}</strong></span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                    <motion.div className="glass-card" style={{padding:24,minWidth:200,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center"}}
                      initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} transition={{delay:0.3}}>
                      <div style={{fontSize:11,color:"rgba(0,0,0,0.6)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Pipeline Duration</div>
                      <div style={{fontSize:36,fontWeight:900,color:"#22c55e",fontFamily:"'JetBrains Mono',monospace"}}>{result.pipeline_duration_ms.toFixed(0)}<span style={{fontSize:14,color:"rgba(74,222,128,0.6)"}}>ms</span></div>
                    </motion.div>
                  </div>

                  {/* Affected Objects Table */}
                  <motion.div className="glass-card" style={{overflow:"hidden",marginBottom:24}}
                    initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.3}}>
                    <div style={{padding:"20px 24px",borderBottom:"1px solid rgba(0,0,0,0.05)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div className="section-title"><span className="icon-wrapper" style={{background:"rgba(59,130,246,0.1)",color:"#f85018"}}><ClipboardList size={14} /></span>Affected Objects</div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <div style={{display:"flex",gap:8,fontSize:11}}>
                          <span style={{color:"#22c55e"}}>{Object.values(objectDecisions).filter(d=>d==="approved").length} approved</span>
                          <span style={{color:"#dc2626"}}>{Object.values(objectDecisions).filter(d=>d==="rejected").length} rejected</span>
                          <span style={{color:"rgba(0,0,0,0.6)"}}>{Object.values(objectDecisions).filter(d=>d==="pending").length} pending</span>
                        </div>
                        <span style={{fontSize:11,color:"rgba(0,0,0,0.6)",background:"rgba(0,0,0,0.04)",padding:"4px 12px",borderRadius:20}}>{result.impact_report.total_affected} objects</span>
                      </div>
                    </div>
                    <div style={{overflowX:"auto"}}>
                      <table className="data-table">
                        <thead><tr>
                          <th>Object</th><th>Module</th><th>Risk Level</th><th>Score</th><th style={{textAlign:"center"}}>Blast Radius</th><th>Reasoning</th><th style={{textAlign:"center"}}>Decision</th>
                        </tr></thead>
                        <tbody>
                          {result.impact_report.affected_objects.map((ao,i)=>{
                            const dec=objectDecisions[ao.object.name]||"pending";
                            return(
                            <motion.tr key={i} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:0.35+i*0.05}}
                              style={{background:dec==="approved"?"rgba(74,222,128,0.03)":dec==="rejected"?"rgba(248,113,113,0.03)":"transparent"}}>
                              <td>
                                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"rgba(0,0,0,0.85)"}}>{ao.object.name}</div>
                                <div style={{fontSize:11,color:"rgba(0,0,0,0.6)",marginTop:2}}>{ao.object.description}</div>
                              </td>
                              <td><span className="badge badge-blue">{ao.object.module}</span></td>
                              <td><RiskBadge level={ao.risk.level}/></td>
                              <td><span style={{fontSize:13,fontWeight:700,color:RISK_COLORS[ao.risk.level],fontFamily:"monospace"}}>{ao.risk.score.toFixed(1)}</span></td>
                              <td style={{textAlign:"center"}}><span style={{fontSize:18,fontWeight:800,color:"rgba(0,0,0,0.6)",fontFamily:"monospace"}}>{ao.blast_radius}</span></td>
                              <td style={{fontSize:11,color:"rgba(0,0,0,0.6)",maxWidth:280,lineHeight:1.5}}>{ao.risk.reasoning}</td>
                              <td style={{textAlign:"center"}}>
                                <div style={{display:"flex",gap:6,justifyContent:"center"}}>
                                  <motion.button onClick={()=>toggleDecision(ao.object.name,"approved")}
                                    whileHover={{scale:1.15}} whileTap={{scale:0.9}}
                                    title="Approve for modification"
                                    style={{width:32,height:32,borderRadius:8,border:"none",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",
                                      background:dec==="approved"?"rgba(74,222,128,0.2)":"rgba(0,0,0,0.04)",
                                      color:dec==="approved"?"#22c55e":"rgba(0,0,0,0.6)",
                                      transition:"all .2s"}}
                                  ><Check size={14} /></motion.button>
                                  <motion.button onClick={()=>toggleDecision(ao.object.name,"rejected")}
                                    whileHover={{scale:1.15}} whileTap={{scale:0.9}}
                                    title="Reject / defer"
                                    style={{width:32,height:32,borderRadius:8,border:"none",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",
                                      background:dec==="rejected"?"rgba(248,113,113,0.2)":"rgba(0,0,0,0.04)",
                                      color:dec==="rejected"?"#dc2626":"rgba(0,0,0,0.6)",
                                      transition:"all .2s"}}
                                  ><X size={14} /></motion.button>
                                </div>
                              </td>
                            </motion.tr>
                          );})}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>

                  {/* Test Suite */}
                  <motion.div className="glass-card" style={{overflow:"hidden"}}
                    initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.4}}>
                    <div style={{padding:"20px 24px",borderBottom:"1px solid rgba(0,0,0,0.05)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div className="section-title"><span className="icon-wrapper" style={{background:"rgba(34,197,94,0.1)",color:"#22c55e"}}><FlaskConical size={14} /></span>Generated Test Suite</div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <span className="badge badge-low" style={{fontSize:12}}>✓ {result.test_suite.coverage_percent}% Coverage</span>
                        <motion.button onClick={exportReport} className="btn-primary"
                          style={{padding:"8px 18px",fontSize:12,borderRadius:10}}
                          whileHover={{scale:1.04}} whileTap={{scale:0.96}}>
                          <Download size={13} /> Export Report
                        </motion.button>
                      </div>
                    </div>
                    <div>
                      {result.test_suite.test_cases.map((tc,i)=>(
                        <div key={i} style={{borderBottom:"1px solid rgba(0,0,0,0.03)"}}>
                          <button onClick={()=>setExpandedTest(expandedTest===i?null:i)}
                            style={{width:"100%",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"none",border:"none",cursor:"pointer",textAlign:"left",fontFamily:"inherit",color:"inherit"}}>
                            <div style={{display:"flex",alignItems:"center",gap:12}}>
                              <span className={`badge ${tc.type==="UNIT"?"badge-blue":"badge-violet"}`}>{tc.type}</span>
                              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:"rgba(0,0,0,0.8)",fontWeight:500}}>{tc.name}</span>
                            </div>
                            <motion.span style={{color:"rgba(0,0,0,0.5)",fontSize:18,fontWeight:300}}
                              animate={{rotate:expandedTest===i?180:0}}>
                              {expandedTest===i?"−":"+"}
                            </motion.span>
                          </button>
                          <AnimatePresence>
                          {expandedTest===i&&(
                            <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.3}}
                              style={{overflow:"hidden"}}>
                              <div style={{padding:"0 24px 20px"}}>
                                <p style={{fontSize:12,color:"rgba(0,0,0,0.7)",marginBottom:12,lineHeight:1.6}}>{tc.description}</p>
                                <div className="code-block" style={{maxHeight:400,overflowY:"auto"}}>
                                  <pre style={{color:"rgba(74,222,128,0.8)",margin:0}}>{tc.abap_code}</pre>
                                </div>
                              </div>
                            </motion.div>
                          )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── GRAPH ──────────────────────────────────────────────────── */}
          {tab==="graph"&&(
            <motion.div key="graph" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.35}}>
              <div className="section-header">
                <div className="section-title" style={{fontSize:"1.25rem"}}>
                  <span className="icon-wrapper" style={{background:"rgba(59,130,246,0.1)",width:40,height:40,color:"#f85018"}}><GitBranch size={18} /></span>
                  Dependency Graph
                </div>
                {affectedNames.size>0&&<span className="badge badge-critical">{affectedNames.size} affected nodes</span>}
              </div>
              <p style={{fontSize:13,color:"rgba(0,0,0,0.6)",marginBottom:24}}>Directed dependency graph of {result?.objects_parsed || "all"} ABAP objects. Purple edges indicate cross-module dependencies. Glowing nodes are affected by your last impact analysis. <strong style={{color:"rgba(0,0,0,0.5)"}}>Hover</strong> to inspect nodes.</p>
              <div className="glass-card" style={{padding:12}}>
                <DependencyGraph affectedNames={affectedNames} graphData={result?.graph_data} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginTop:20}}>
                {[{label:"Total Nodes",val:result?.graph_data?.nodes.length.toString() || "0",iconEl:<CircleDot size={20} />},{label:"Total Edges",val:result?.graph_data?.edges.length.toString() || "0",iconEl:<Link2 size={20} />},{label:"Cross-Module Deps",val:result?.graph_data?.edges.filter(e=>result?.graph_data?.nodes.find(n=>n.id===e.source)?.group !== result?.graph_data?.nodes.find(n=>n.id===e.target)?.group).length.toString() || "0",iconEl:<Shuffle size={20} />}].map((s,i)=>(
                  <motion.div key={i} className="glass-card" style={{padding:20,display:"flex",alignItems:"center",gap:14}}
                    initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.1}}>
                    <span style={{color:"rgba(0,0,0,0.6)"}}>{s.iconEl}</span>
                    <div>
                      <div style={{fontSize:11,color:"rgba(0,0,0,0.6)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{s.label}</div>
                      <div style={{fontSize:24,fontWeight:800,color:"rgba(0,0,0,0.9)"}}>{s.val}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── AGENTS ─────────────────────────────────────────────────── */}
          {tab==="agents"&&(
            <motion.div key="agents" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.35}}>
              <AgentMonitor agentStatuses={result?.agent_statuses||null} />
              <Terminal logs={logs} running={analyzing}/>
            </motion.div>
          )}

          {/* ── CODEBASE ───────────────────────────────────────────────── */}
          {tab==="codebase"&&(
            <motion.div key="codebase" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.35}}>
              <div className="section-header">
                <div className="section-title" style={{fontSize:"1.25rem"}}>
                  <span className="icon-wrapper" style={{background:"rgba(249,115,22,0.1)",width:40,height:40,color:"#f97316"}}><FolderCode size={18} /></span>Codebase Explorer
                </div>
                <span style={{fontSize:12,color:"rgba(0,0,0,0.6)"}}>{Object.values(modules).flat().length} objects · 3 modules</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20}}>
                {/* Tree */}
                <div className="glass-card" style={{padding:16,maxHeight:660,overflowY:"auto"}}>
                  {Object.entries(modules).map(([mod,objs])=>(
                    <div key={mod} style={{marginBottom:20}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:MODULE_COLORS[mod]||"#6b7280",flexShrink:0,boxShadow:`0 0 8px ${MODULE_COLORS[mod]||"#6b7280"}60`}}/>
                        <span style={{fontSize:11,fontWeight:700,color:MODULE_COLORS[mod]||"#6b7280",letterSpacing:"0.06em"}}>{mod} MODULE</span>
                        <span style={{fontSize:10,color:"rgba(0,0,0,0.5)",background:"rgba(0,0,0,0.05)",padding:"2px 8px",borderRadius:9999}}>{objs.length}</span>
                      </div>
                      <div style={{paddingLeft:20,display:"flex",flexDirection:"column",gap:2}}>
                        {objs.map(obj=>(
                          <motion.button key={obj.name} onClick={()=>loadCode(obj.name)}
                            whileHover={{x:3}} whileTap={{scale:0.98}}
                            style={{textAlign:"left",padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",
                              background:selObj===obj.name?"rgba(59,130,246,0.1)":"transparent",
                              transition:"all .2s",fontFamily:"inherit",color:"inherit"}}>
                            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:selObj===obj.name?600:400,color:selObj===obj.name?"rgba(0,0,0,0.9)":"rgba(0,0,0,0.7)"}}>
                              {obj.name}
                              {affectedNames.has(obj.name)&&<span style={{marginLeft:6,color:"#dc2626",fontSize:9}}>● affected</span>}
                            </div>
                            <div style={{fontSize:10,color:"rgba(0,0,0,0.5)",marginTop:2}}>{obj.description}</div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Viewer */}
                <div className="glass-card" style={{overflow:"hidden",minHeight:400}}>
                  {selObj?(
                    <>
                      <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(0,0,0,0.05)",display:"flex",alignItems:"center",gap:12,background:"rgba(0,0,0,0.02)"}}>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:700,color:"rgba(0,0,0,0.9)"}}>{selObj}</span>
                        {affectedNames.has(selObj)&&<RiskBadge level={result?.impact_report.affected_objects.find(a=>a.object.name===selObj)?.risk.level||"MEDIUM"}/>}
                      </div>
                      <div style={{padding:20,maxHeight:600,overflowY:"auto",background:"#ffffff"}}>
                        <pre style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,lineHeight:1.8,color:"rgba(74,222,128,0.8)",margin:0}}>{objCode||"Loading..."}</pre>
                      </div>
                    </>
                  ):(
                    <div style={{padding:80,textAlign:"center",color:"rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <FolderCode size={48} style={{marginBottom:16,opacity:0.5}} />
                      <p style={{fontSize:15,fontWeight:500}}>Select an object from the tree</p>
                      <p style={{fontSize:12,marginTop:8,color:"rgba(0,0,0,0.1)"}}>View full ABAP source code and dependency details</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ABOUT ──────────────────────────────────────────────────── */}
          {tab==="about"&&(
            <motion.div key="about" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.35}}
              style={{maxWidth:960,margin:"0 auto"}}>

              {/* Hero */}
              <div style={{textAlign:"center",marginBottom:48}}>
                <motion.div
                  style={{width:80,height:80,borderRadius:22,background:"linear-gradient(135deg,#f85018,#feac3e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,fontWeight:900,margin:"0 auto 20px",boxShadow:"0 8px 40px rgba(248,80,24,0.35)"}}
                  animate={{rotate:[0,5,-5,0]}} transition={{duration:3,repeat:Infinity,repeatDelay:2}}>
                  L
                </motion.div>
                <h1 className="gradient-text" style={{fontSize:48,fontWeight:900,letterSpacing:"-0.03em",marginBottom:10}}>LegacyMind</h1>
                <p style={{fontSize:17,color:"rgba(0,0,0,0.8)",maxWidth:600,margin:"0 auto",lineHeight:1.7}}>AI-powered impact analysis for enterprise systems. Weeks of work in minutes, with full human oversight.</p>
              </div>

              {/* Problem + Solution */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24,marginTop:32}}>
                <motion.div className="glass-card" style={{padding:28}}
                  initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{delay:0.15}}>
                  <h2 style={{fontSize:18,fontWeight:700,color:"#dc2626",marginBottom:14,display:"flex",alignItems:"center",gap:10}}><Target size={20} style={{flexShrink:0}} />The Problem</h2>
                  <p style={{fontSize:13,color:"rgba(0,0,0,0.8)",lineHeight:1.8,marginBottom:16}}>Enterprises run on <strong style={{color:"rgba(0,0,0,0.7)"}}>millions of lines of undocumented ABAP code</strong>. When regulations change (GDPR, SOX) or platforms must modernize to S/4HANA, mapping the blast radius of a single change manually is incredibly slow, expensive, and error-prone.</p>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {["Manual dependency tracing across modules","No automated risk scoring","Test plans created by hand — weeks of work","Critical cross-module impacts missed"].map((item,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"rgba(0,0,0,0.7)"}}>
                        <X size={12} style={{color:"#dc2626",flexShrink:0}} />{item}
                      </div>
                    ))}
                  </div>
                </motion.div>
                <motion.div className="glass-card" style={{padding:28}}
                  initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} transition={{delay:0.2}}>
                  <h2 style={{fontSize:18,fontWeight:700,color:"#22c55e",marginBottom:14,display:"flex",alignItems:"center",gap:10}}><Lightbulb size={20} style={{flexShrink:0}} />The Solution</h2>
                  <p style={{fontSize:13,color:"rgba(0,0,0,0.8)",lineHeight:1.8,marginBottom:16}}>LegacyMind deploys <strong style={{color:"rgba(0,0,0,0.7)"}}>3 specialized AI agents</strong> that parse every ABAP object, build a dependency graph with PageRank scoring, and generate a complete test suite — drastically reducing analysis time while mathematically proving safety.</p>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {["Automated dependency graph with PageRank centrality","AI-powered multi-factor risk scoring","Complete ABAP Unit test generation","Human-in-the-loop approve/reject workflow"].map((item,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"rgba(0,0,0,0.7)"}}>
                        <Check size={12} style={{color:"#22c55e",flexShrink:0}} />{item}
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* How It Works */}
              <motion.div className="glass-card" style={{padding:32,marginBottom:24}}
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.25}}>
                <h2 style={{fontSize:18,fontWeight:700,color:"#22d3ee",marginBottom:24,display:"flex",alignItems:"center",gap:10}}><Cog size={20} style={{flexShrink:0}} />How It Works</h2>
                <div style={{display:"flex",alignItems:"stretch",gap:0}}>
                  {[
                    {step:"1",title:"Describe",desc:"Enter a change request in natural language",icon:<ClipboardList size={22} />,col:"#f85018",time:"0s"},
                    {step:"2",title:"Parse",desc:"CodeArchaeologist scans all ABAP objects, builds dependency graph",icon:<Search size={22} />,col:"#3b82f6",time:"<1s"},
                    {step:"3",title:"Analyze",desc:"ImpactAnalyzer scores risk using AI + PageRank + blast radius",icon:<Zap size={22} />,col:"#f97316",time:"<5s"},
                    {step:"4",title:"Generate",desc:"TestGenerator creates ABAP Unit & Integration test suites",icon:<FlaskConical size={22} />,col:"#22c55e",time:"<5s"},
                    {step:"5",title:"Review",desc:"Human approves/rejects each object. Export full report.",icon:<UserCheck size={22} />,col:"#a78bfa",time:"You decide"},
                  ].map((s,i)=>(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",position:"relative"}}>
                      {i>0&&<div style={{position:"absolute",left:0,top:28,width:"50%",height:2,background:`linear-gradient(90deg,${["#f85018","#3b82f6","#f97316","#22c55e"][i-1]},${s.col})`}}/>}
                      {i<4&&<div style={{position:"absolute",right:0,top:28,width:"50%",height:2,background:`linear-gradient(90deg,${s.col},${["#3b82f6","#f97316","#22c55e","#a78bfa"][i]})`}}/>}
                      <motion.div
                        style={{width:56,height:56,borderRadius:16,background:`${s.col}15`,border:`2px solid ${s.col}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,position:"relative",zIndex:1}}
                        whileHover={{scale:1.1,borderColor:s.col}}>
                        {s.icon}
                      </motion.div>
                      <div style={{fontSize:12,fontWeight:700,color:s.col,marginTop:12}}>{s.title}</div>
                      <div style={{fontSize:10,color:"rgba(0,0,0,0.6)",textAlign:"center",marginTop:4,lineHeight:1.5,padding:"0 4px"}}>{s.desc}</div>
                      <div style={{fontSize:10,color:"rgba(0,0,0,0.15)",marginTop:6,fontFamily:"monospace"}}>{s.time}</div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Architecture — Agent Cards */}
              <motion.div className="glass-card" style={{padding:32,marginBottom:24}}
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.3}}>
                <h2 style={{fontSize:18,fontWeight:700,color:"#f85018",marginBottom:20,display:"flex",alignItems:"center",gap:10}}><Cog size={20} style={{flexShrink:0}} />Agent Architecture</h2>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
                  {[
                    {n:"CodeArchaeologist",icon:<Search size={28} strokeWidth={1.5} />,col:"#3b82f6",desc:"Parses ABAP source code using regex patterns. Extracts CALL FUNCTION, PERFORM, SELECT FROM statements. Builds a directed dependency graph with NetworkX and computes PageRank centrality scores.",tech:["Python","NetworkX","Regex","PageRank"]},
                    {n:"ImpactAnalyzer",icon:<Zap size={28} strokeWidth={1.5} />,col:"#f97316",desc:"Interprets change requests using LLM. Performs BFS traversal on the dependency graph. Computes multi-factor risk scores combining table sensitivity, centrality, and blast radius.",tech:["LLM/AI","BFS/DFS","Risk Engine","NLP"]},
                    {n:"TestGenerator",icon:<FlaskConical size={28} strokeWidth={1.5} />,col:"#22c55e",desc:"Generates ABAP Unit test classes and integration test suites for every affected object. Tests cover data integrity, GDPR erasure flows, and cascading deletion validation.",tech:["ABAP Unit","AI Templates","Coverage"]},
                  ].map((a,i)=>(
                    <motion.div key={i} style={{padding:24,borderRadius:16,background:"rgba(0,0,0,0.02)",border:`1px solid ${a.col}20`}}
                      whileHover={{y:-4,borderColor:`${a.col}60`,boxShadow:`0 8px 32px ${a.col}15`}}>
                      <div style={{color:a.col,marginBottom:12}}>{a.icon}</div>
                      <div style={{fontSize:14,fontWeight:700,color:a.col,marginBottom:10}}>{a.n}</div>
                      <p style={{fontSize:11,color:"rgba(0,0,0,0.7)",lineHeight:1.7,marginBottom:14}}>{a.desc}</p>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {a.tech.map((t,j)=>(
                          <span key={j} style={{fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:6,background:`${a.col}12`,color:`${a.col}`,border:`1px solid ${a.col}30`,letterSpacing:"0.04em"}}>{t}</span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
                {/* Orchestrator bar */}
                <div style={{marginTop:16,padding:"14px 20px",borderRadius:12,background:"linear-gradient(90deg,rgba(59,130,246,0.06),rgba(139,92,246,0.06))",border:"1px solid rgba(139,92,246,0.15)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <Bot size={18} style={{color:"#a78bfa",flexShrink:0}} />
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"#a78bfa"}}>Orchestrator</div>
                      <div style={{fontSize:10,color:"rgba(0,0,0,0.6)"}}>Coordinates all agents • Manages pipeline • Handles failover</div>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:"rgba(0,0,0,0.5)",fontFamily:"monospace"}}>FastAPI • WebSocket • REST</div>
                </div>
              </motion.div>

              {/* Tech Stack */}
              <motion.div className="glass-card" style={{padding:32,marginBottom:24}}
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.35}}>
                <h2 style={{fontSize:18,fontWeight:700,color:"#fbbf24",marginBottom:20,display:"flex",alignItems:"center",gap:10}}><Wrench size={20} style={{flexShrink:0}} />Tech Stack</h2>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"rgba(0,0,0,0.6)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Backend</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {["Python 3.11","FastAPI","NetworkX","Pydantic","WebSockets","Pollinations AI","uvicorn"].map((t,i)=>(
                        <span key={i} style={{fontSize:11,fontWeight:500,padding:"6px 14px",borderRadius:8,background:"rgba(59,130,246,0.08)",color:"#f85018",border:"1px solid rgba(59,130,246,0.15)"}}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"rgba(0,0,0,0.6)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Frontend</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {["Next.js 15","React 19","TypeScript","Framer Motion","Canvas API","Lucide Icons","JetBrains Mono"].map((t,i)=>(
                        <span key={i} style={{fontSize:11,fontWeight:500,padding:"6px 14px",borderRadius:8,background:"rgba(34,197,94,0.08)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.15)"}}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{marginTop:20}}>
                  <div style={{fontSize:11,fontWeight:600,color:"rgba(0,0,0,0.6)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>AI / ML</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {["PageRank Algorithm","BFS Graph Traversal","NLP Entity Extraction","Multi-Factor Risk Scoring","LLM Failover Chain","Regex AST Parsing"].map((t,i)=>(
                      <span key={i} style={{fontSize:11,fontWeight:500,padding:"6px 14px",borderRadius:8,background:"rgba(139,92,246,0.08)",color:"#a78bfa",border:"1px solid rgba(139,92,246,0.15)"}}>{t}</span>
                    ))}
                  </div>
                </div>
              </motion.div>



              {/* CTA */}
              <motion.div className="glass-card" style={{padding:32,overflow:"hidden",position:"relative",textAlign:"center"}}
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.45}}>
                <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",background:"radial-gradient(circle,rgba(59,130,246,0.1),transparent)",pointerEvents:"none"}}/>
                <h2 style={{fontSize:20,fontWeight:700,color:"rgba(0,0,0,0.9)",marginBottom:10}}>Ready to modernize your legacy systems?</h2>
                <p style={{fontSize:13,color:"rgba(0,0,0,0.7)",lineHeight:1.7,marginBottom:20,maxWidth:500,margin:"0 auto 20px"}}>LegacyMind turns months of manual impact analysis into seconds of automated intelligence. Try it now.</p>
                <motion.button onClick={()=>{setTab("analysis");window.scrollTo(0,0)}} className="btn-primary"
                  style={{padding:"12px 32px",fontSize:14,borderRadius:12,display:"inline-flex",alignItems:"center",gap:8}}
                  whileHover={{scale:1.02}} whileTap={{scale:0.98}}>
                  <ArrowRight size={16} /> Go to Analysis
                </motion.button>
              </motion.div>

              {/* Footer info */}
              <div style={{textAlign:"center",marginTop:32,padding:"20px 0"}}>
                <p style={{fontSize:12,color:"rgba(0,0,0,0.15)"}}>LegacyMind · Enterprise AI · {new Date().getFullYear()}</p>
              </div>
            </motion.div>
          )}

          </AnimatePresence>
        </div>

        <footer style={{borderTop:"1px solid rgba(0,0,0,0.04)",padding:"16px 28px",textAlign:"center",fontSize:11,color:"rgba(0,0,0,0.15)"}}>
          LegacyMind · AI-Powered Legacy System Modernization · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
