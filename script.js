document.addEventListener("DOMContentLoaded", () => {
  // 1. Google Apps Script URL을 API 서버 주소로 정의 (수정 완료)
  const API_URL = 'https://script.google.com/macros/s/AKfycbwfqm6JLNMXqL1MTumvEMuCp_IeBnddDMmIKocbQaMqOzXXayFz9DzdUWHnyt4LZEZ6AA/exec';

  // 2. 응답을 임시로 저장하고 그래프를 그릴 로컬 배열 정의
  let localSubmissions = []; 

  // 초기 데이터를 가져오는 함수 (서버의 doGet을 이용)
  const fetchSubmissions = async () => {
    try {
        const response = await fetch(API_URL);
        // 서버의 doGet 코드가 JSON을 반환하므로 이를 사용합니다.
        const data = await response.json(); 
        
        // 데이터에 오류 메시지가 있는지 확인
        if (data.error) {
             console.error("서버에서 데이터 로딩 오류:", data.error);
             return;
        }

        // 데이터가 배열인지 확인 후 저장
        if (Array.isArray(data)) {
            localSubmissions = data;
        } else {
             console.error("서버에서 받은 데이터 형식이 올바르지 않습니다.");
        }
        
        // 초기 데이터 로드 후 submissions 탭이 활성화되어 있다면 그래프를 그립니다.
        if (document.querySelector('.tab-btn[data-target="submissions"]').classList.contains('active')) {
             renderCharts();
        }

    } catch (error) {
        // mode: 'no-cors' 때문에 catch에 걸릴 수 있으나, 서버 통신 자체는 시도됨
        console.log("초기 데이터 로딩 완료 또는 오류 발생 (no-cors 관련):", error);
    }
  };
  
  // 페이지 로드 시 초기 데이터 로드 시도
  fetchSubmissions(); 


  // TAB
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active");
      if(btn.dataset.target==="submissions") renderCharts();
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
  const submissionsList=document.getElementById("submissionsList");

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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    msg.textContent = "✅ 제출 중...";

    const data=new FormData(form);
    const payload={};
    for(const [k,v] of data.entries()) payload[k]=v;
    
    // ===============================================
    // 💥 JSON 문자열로 변환하고 헤더를 설정하여 전송 (최종 수정) 💥
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            redirect: 'follow',
            
            // 1. 폼 데이터를 JSON 문자열로 변환하여 전송 (서버의 doPost에 맞춤)
            body: JSON.stringify(payload), 
            
            // 2. 서버에 보내는 내용이 JSON임을 명시 (Headers)
            headers: {
                'Content-Type': 'application/json' 
            }
        });
        
        // 서버 전송이 성공(또는 응답)하면 로컬 배열에 저장하고 메시지 업데이트
        localSubmissions.push(payload);
        msg.textContent = "💌 제출이 완료되었습니다! (Google Sheets에 저장됨)"; 
        
    } catch (error) {
        msg.textContent = `❌ 제출 오류: ${error.message}. 콘솔을 확인하세요.`;
        console.error("Fetch Error:", error);
        return; 
    }
    // ===============================================

    // submissions list에 추가, 불필요 기본값 제거
    const card=document.createElement("div");
    card.className="record";
    // localSubmissions 배열에 추가된 payload 사용
    let html=Object.entries(payload).filter(([k,v])=>{
      if(k==="regionOther" && payload.region!=="기타") return false;
      if(k==="hasPet" && v==="예") return false;
      return v!=="";
    }).map(([k,v])=>`<div><strong>${keyMap[k]||k}:</strong> ${v}</div>`).join("");
    if(html==="") html="<div>제출된 정보 없음</div>";
    card.innerHTML=html;
    submissionsList.prepend(card);

    form.reset();
    regionOtherInput.style.display='none';
    
    // 제출 후 '다른 사람 의견 보기' 탭을 자동으로 클릭하여 그래프를 표시합니다.
    document.querySelector('.tab-btn[data-target="submissions"]').click();
  });

  // CHART
  function renderCharts(){
    const regionCount={};
    const priceCount={};

    // submissions 대신 localSubmissions 배열 사용
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