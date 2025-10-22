document.addEventListener("DOMContentLoaded", () => {
  // Google Apps Script URL (고객님의 기존 URL 유지)
  const API_URL = 'https://script.google.com/macros/s/AKfycbwfqm6JLNMXqL1MTumvEMuCp_IeBnddDMmIKocbQaMqOzXXayFz9DzdUWHnyt4LZEZ6AA/exec';
  
  const form = document.getElementById("petSurveyForm");
  const msg = document.getElementById("msg");
  const submissionsList = document.getElementById("submissionsList");
  const regionOtherInput = document.querySelector('input[name="regionOther"]');
  const tabBtns = document.querySelectorAll(".tab-btn");

  // 로컬 배열에 서버 데이터를 저장 (이 배열을 기반으로 목록과 그래프를 그림)
  let localSubmissions = [];

  // Key map (라벨)
  const keyMap = {
    hasPet: "반려동물 보유",
    region: "지역",
    regionOther: "직접 입력 지역",
    priorityCriteria: "병원 선택 기준",
    concernAndFeature: "불만/필요 기능",
    priority1: "1순위 정보",
    priority2: "2순위 정보",
    priceRange: "최대 지불 의향"
  };

  /**
   * 1. 서버에서 최신 데이터를 가져와 localSubmissions를 갱신하고, 화면을 다시 그리는 핵심 함수
   * ⭐️ 핵심 수정: 캐시 우회 로직을 포함하여 무조건 최신 데이터를 가져옵니다.
   */
  const fetchSubmissions = async () => {
    try {
      // 캐시를 강제로 우회하는 쿼리 파라미터를 추가합니다.
      const uniqueApiUrl = `${API_URL}?t=${new Date().getTime()}`;
      submissionsList.innerHTML = '<div class="placeholder">제출된 기록을 불러오는 중입니다...</div>'; // 로딩 메시지

      const res = await fetch(uniqueApiUrl);
      const data = await res.json();
      
      if (Array.isArray(data)) {
        localSubmissions = data; // ⭐️ 서버의 전체 데이터로 로컬 배열 갱신
        renderSubmissions(); // 목록 갱신
        renderCharts();      // 그래프 갱신
      } else {
        submissionsList.innerHTML = '<div class="placeholder">데이터 로딩 실패. 서버 응답을 확인하세요.</div>';
      }
    } catch (error) {
      console.error("서버 데이터 로딩 오류:", error);
      submissionsList.innerHTML = '<div class="placeholder">네트워크 오류로 데이터를 불러올 수 없습니다.</div>';
    }
  };

  // 2. "기타" 입력 토글 (기존 유지)
  document.querySelectorAll('input[name="region"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === "기타") {
        regionOtherInput.style.display = "block";
        regionOtherInput.required = true;
      } else {
        regionOtherInput.style.display = "none";
        regionOtherInput.required = false;
      }
    });
  });

  // 3. 폼 제출
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "✅ 제출 중...";

    const data = new FormData(form);
    const payload = {};
    for (const [k, v] of data.entries()) payload[k] = v;

    try {
      await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      msg.textContent = "💌 제출이 완료되었습니다! 데이터 갱신 중...";
      form.reset();
      regionOtherInput.style.display = "none";

      // ⭐️ 핵심 수정: POST 후, 서버에서 전체 데이터를 다시 불러와 localSubmissions를 갱신합니다.
      await fetchSubmissions(); 

      // '다른 사람 의견 보기' 탭으로 전환
      tabBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.querySelector('.tab-btn[data-target="submissions"]').classList.add("active");
      document.getElementById("submissions").classList.add("active");

    } catch (error) {
      msg.textContent = "⚠️ 서버 응답 오류 발생. 데이터 갱신을 시도합니다.";
      await fetchSubmissions(); 
      // 탭 활성화 로직 유지
      tabBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.querySelector('.tab-btn[data-target="submissions"]').classList.add("active");
      document.getElementById("submissions").classList.add("active");
    }
  });

  // 4. submissions 렌더링
  const renderSubmissions = () => {
    submissionsList.innerHTML = ""; // ⭐️ 중복을 막기 위해 목록을 먼저 비웁니다.
    
    if (localSubmissions.length === 0) {
        submissionsList.innerHTML = '<div class="placeholder">제출된 기록이 없습니다.</div>';
        return;
    }
    
    // 목록을 최신순으로 렌더링
    localSubmissions.slice().reverse().forEach((sub) => {
      const card = document.createElement("div");
      card.className = "record";
      let html = Object.entries(sub)
        // 불필요한 값 필터링
        .filter(([k,v]) => !(k === "regionOther" && sub.region !== "기타") && v !== "")
        .map(([k,v]) => `<div><strong>${keyMap[k]||k}:</strong> ${v}</div>`)
        .join("");
      if (!html) html = "<div>제출된 정보 없음</div>";
      card.innerHTML = html;
      submissionsList.appendChild(card);
    });
  };

  // 5. 그래프 렌더링
  const renderCharts = () => {
    // 1. 데이터 집계
    const regionCount = {};
    const priceCount = {};

    localSubmissions.forEach(sub => {
      const reg = sub.region === "기타" ? sub.regionOther : sub.region;
      if (reg) regionCount[reg] = (regionCount[reg] || 0) + 1;
      if (sub.priceRange) priceCount[sub.priceRange] = (priceCount[sub.priceRange] || 0) + 1;
    });

    // 2. 차트 그리기 헬퍼 함수
    const renderBarChart = (ctxId, labels, data, color) => {
      const ctx = document.getElementById(ctxId).getContext("2d");
      // 기존 차트 인스턴스 파괴
      if (window[ctxId] && typeof window[ctxId].destroy === 'function') {
        window[ctxId].destroy();
      }
      
      window[ctxId] = new Chart(ctx, {
        type: "bar",
        data: { labels: labels, datasets: [{ label: "응답 수", data: data, backgroundColor: color }] },
        options: { 
            responsive: true, 
            plugins: { legend: { display: false } },
            // ⭐️ Y축 최소값 0 강제 설정 (핵심 수정)
            scales: { y: { beginAtZero: true, suggestedMin: 0 } }
        }
      });
    };

    // 가격대 라벨 순서 재정의 (정렬하여 차트 가독성 향상)
    const priceLabelsOrdered = ["50만원 미만", "50만원 ~ 100만원", "100만원 ~ 200만원", "200만원 이상"];
    const priceDataOrdered = priceLabelsOrdered.map(label => priceCount[label] || 0);

    // 차트 호출
    renderBarChart("regionChart", Object.keys(regionCount), Object.values(regionCount), "rgba(255,77,79,0.7)");
    renderBarChart("priceChart", priceLabelsOrdered, priceDataOrdered, "rgba(255,159,67,0.7)");
  };

  // 6. 탭 클릭 이벤트
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active");

      if (btn.dataset.target === "submissions") {
        // ⭐️ 핵심 수정: submissions 탭을 누를 때마다 서버에서 최신 데이터를 가져옵니다.
        fetchSubmissions(); 
      }
    });
  });

  // 초기 서버 데이터 로드 (페이지 로드 시 데이터 한번 가져오기)
  fetchSubmissions();
});
