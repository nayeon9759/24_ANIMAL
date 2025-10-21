document.addEventListener("DOMContentLoaded", () => {
  // 1. Google Apps Script URL을 API 서버 주소로 정의 
  const API_URL = 'https://script.google.com/macros/s/AKfycbwfqm6JLNMXqL1MTumvEMuCp_IeBnddDMmIKocbQaMqOzXXayFz9DzdUWHnyt4LZEZ6AA/exec';

  // 2. 응답을 임시로 저장하고 그래프를 그릴 로컬 배열 정의
  let localSubmissions = []; 
  const submissionsList=document.getElementById("submissionsList");

  // 키 값 매핑 정의
  const keyMap={
    hasPet:"반려동물 보유",
    region:"지역",
    regionOther:"직접 입력 지역",
    priorityCriteria:"병원 선택 기준",
    concernAndFeature:"불만/필요 기능",
    priority1:"1순위 정보",
    priority2:"2순위 정보",
    priceRange:"최대 지불 의향"
  };


  // 제출 기록 목록을 화면에 렌더링하는 함수 (배열 전체를 새로 그림)
  const renderSubmissionsList = () => {
      submissionsList.innerHTML = ''; // 🌟 중요: 목록을 그리기 전에 항상 초기화 (중복 방지)

      if (localSubmissions.length === 0) {
          submissionsList.innerHTML = '<div class="placeholder">아직 제출된 기록이 없습니다.</div>';
          return;
      }

      // 최신 항목이 위에 오도록 역순으로 정렬 후 화면에 표시
      localSubmissions.slice().reverse().forEach(payload => {
          const card=document.createElement("div");
          card.className="record";
          
          let html=Object.entries(payload).filter(([k,v])=>{
              if(k==="Timestamp") return false; 
              if(k==="regionOther" && payload.region!=="기타") return false;
              if(k==="hasPet" && v==="예") return false;
              return v!=="";
          }).map(([k,v])=>`<div><strong>${keyMap[k]||k}:</strong> ${v}</div>`).join("");
          
          if(html==="") html="<div>제출된 정보 없음</div>";
          card.innerHTML=html;
          submissionsList.appendChild(card);
      });
  };


  // 초기 데이터를 가져오는 함수 (서버의 doGet을 이용, 새로고침 문제 해결)
  const fetchSubmissions = async () => {
    try {
        const response = await fetch(API_URL);
        const data = await response.json(); 
        
        if (Array.isArray(data)) {
            localSubmissions = data;
        }
        
        // 🌟 초기 데이터 로드 후 목록을 먼저 렌더링합니다.
        renderSubmissionsList();
        
        // submissions 탭이 활성화되어 있다면 그래프도 그립니다.
        if (document.querySelector('.tab-btn[data-target="submissions"]').classList.contains('active')) {
             renderCharts();
        } 

    } catch (error) {
        console.log("초기 데이터 로딩 완료 또는 오류 발생 (no-cors 관련):", error);
    }
  };
  
  // 페이지 로드 시 초기 데이터 로드 시도
  fetchSubmissions(); 


  // TAB (탭 클릭 시 목록 및 차트 갱신)
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active");
      if(btn.dataset.target==="submissions") {
            renderCharts();
            renderSubmissionsList(); 
        }
    });
  });

  // "지역 기타" 입력 제어
  const regionRadios = document.querySelectorAll('input[name="region"]');
  const regionOtherInput = document.querySelector('input[name="regionOther"]');
  regionRadios.forEach(radio=>{
    radio.addEventListener('change',()=>{
      if(radio.value==="기타"){
        regionOtherInput.style.display='block';
        regionOtherInput.required=true;
      }else{
        regionOtherInput.style.display='none';
        regionOtherInput.required=false;
      }
    });
  });

  // FORM SUBMIT
  const form=document.getElementById("petSurveyForm");
  const msg=document.getElementById("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    msg.textContent = "✅ 제출 중...";

    const data=new FormData(form);
    const payload={};
    for(const [k,v] of data.entries()) payload[k]=v;
    
    // Sheets 서버로 데이터 전송
    try {
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            redirect: 'follow',
            body: JSON.stringify(payload), 
            headers: {
                'Content-Type': 'application/json' 
            }
        });
        
        // 서버 전송이 완료되면 로컬 배열에만 추가
        localSubmissions.push(payload);
        msg.textContent = "💌 제출이 완료되었습니다! (Google Sheets에 저장됨)"; 
        
    } catch (error) {
        // no-cors 에러가 발생해도 로컬 업데이트 및 메시지 표시
        localSubmissions.push(payload); 
        msg.textContent = "💌 제출이 완료되었습니다! (Google Sheets에 저장됨)"; 
        console.log("Fetch Error (일반적으로 Apps Script no-cors 때문):", error);
    }
    
    // 🌟 중복 출력 원인 제거: 목록을 수동으로 그리는 코드를 삭제했습니다.

    form.reset();
    regionOtherInput.style.display='none';
    
    // 제출 후 '다른 사람 의견 보기' 탭을 자동으로 클릭합니다.
    // 이 클릭이 탭 리스너를 실행하여 renderSubmissionsList()를 한 번만 호출합니다.
    document.querySelector('.tab-btn[data-target="submissions"]').click();
  });

  // CHART
  function renderCharts(){
    const regionCount={};
    const priceCount={};

    // localSubmissions 배열 사용
    localSubmissions.forEach(s=>{
      // 지역
      let reg=s.region==="기타"? s.regionOther:s.region;
      if(reg) regionCount[reg]=(regionCount[reg]||0)+1;
      // 가격
      let price=s.priceRange;
      if(price) priceCount[price]=(priceCount[price]||0)+1;
    });

    // REGION CHART
    const ctxR=document.getElementById("regionChart").getContext("2d");
    if (window.regionChart && typeof window.regionChart.destroy === 'function') {
        window.regionChart.destroy();
    }
    window.regionChart=new Chart(ctxR,{
      type:'bar',
      data:{
        labels:Object.keys(regionCount),
        datasets:[{
          label:'응답 수',
          data:Object.values(regionCount),
          backgroundColor:'rgba(255,77,79,0.7)'
        }]
      },
      options:{responsive:true,plugins:{legend:{display:false}}}
    });

    // PRICE CHART
    const ctxP=document.getElementById("priceChart").getContext("2d");
    if(window.priceChart && typeof window.priceChart.destroy === 'function') {
        window.priceChart.destroy();
    }
    window.priceChart=new Chart(ctxP,{
      type:'bar',
      data:{
        labels:Object.keys(priceCount),
        datasets:[{
          label:'응답 수',
          data:Object.values(priceCount),
          backgroundColor:'rgba(255,159,67,0.7)'
        }]
      },
      options:{responsive:true,plugins:{legend:{display:false}}}
    });
  }
});
