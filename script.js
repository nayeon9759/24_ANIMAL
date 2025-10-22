document.addEventListener("DOMContentLoaded", () => {
    // 1. Google Apps Script URL을 API 서버 주소로 정의
    const API_URL = 'https://script.google.com/macros/s/AKfycbwfqm6JLNMXqL1MTumvEMuCp_IeBnddDMmIKocbQaMqOzXXayFz9DzdUWHnyt4LZEZ6AA/exec';

    // 2. 응답을 임시로 저장하고 그래프를 그릴 로컬 배열 정의
    let localSubmissions = [];

    const submissionsList = document.getElementById("submissionsList");

    // 제출 항목의 한글 매핑
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
     * 단일 제출 기록을 화면에 렌더링하는 함수 (항목 하나 추가 역할)
     */
    const renderSubmissionCard = (payload) => {
        const card = document.createElement("div");
        card.className = "record";

        let html = Object.entries(payload).filter(([k, v]) => {
            if (k === "regionOther" && payload.region !== "기타") return false;
            if (k === "hasPet" && v === "예") return false;
            return v !== "" && v !== null && v !== undefined;
        }).map(([k, v]) => `<div><strong>${keyMap[k] || k}:</strong> ${v}</div>`).join("");

        if (html === "") html = "<div>제출된 정보 없음</div>";
        card.innerHTML = html;

        submissionsList.prepend(card);
    }

    /**
     * 🔑 핵심 기능: 서버에서 전체 데이터를 가져와 화면을 갱신하는 함수
     * ⚠️ 제목이 사라지는 문제 해결을 위해 submissionsList 내부만 비우도록 수정됨
     */
    const fetchSubmissions = async () => {
        try {
            // 초기 로딩 메시지는 탭이 활성화되지 않은 상태에서는 보여줄 필요가 없습니다.
            // submissions 탭이 활성화되지 않았을 경우, 로딩 메시지를 설정하지 않습니다.
            const isSubmissionsTabActive = document.getElementById('submissions').classList.contains('active');
            if (isSubmissionsTabActive) {
                 submissionsList.innerHTML = '<div class="placeholder">제출된 기록을 불러오는 중입니다...</div>';
            }

            const response = await fetch(API_URL);
            const data = await response.json();

            if (Array.isArray(data)) {
                localSubmissions = data;

                // ⭐️ 목록 중복 및 제목 사라짐 문제 해결: submissionsList 내부의 내용만 제거 후 새로 그립니다.
                submissionsList.innerHTML = '';
                
                if (localSubmissions.length === 0) {
                     submissionsList.innerHTML = '<div class="placeholder">제출된 기록이 없습니다.</div>';
                     // 데이터가 없어도 차트 인스턴스 초기화는 필요하므로 계속 진행
                } else {
                    // 모든 데이터를 목록에 렌더링합니다. (중복 방지)
                    localSubmissions.slice().reverse().forEach(s => renderSubmissionCard(s));
                }
            } else {
                console.error("서버에서 받은 데이터 형식이 올바르지 않습니다.");
                submissionsList.innerHTML = '<div class="placeholder">데이터 로딩에 실패했습니다. 서버 설정(Google Apps Script)을 확인하세요.</div>';
            }
            
            // 데이터가 로드된 후 그래프를 그립니다.
            renderCharts(); 

        } catch (error) {
            console.error("초기 데이터 로딩 중 오류 발생:", error);
            submissionsList.innerHTML = '<div class="placeholder">네트워크 오류로 데이터를 불러올 수 없습니다.</div>';
        }
    };

    // 페이지 로드 시 초기 데이터 로드 시도
    fetchSubmissions();


    // TABS
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(btn.dataset.target).classList.add("active");
            // submissions 탭을 누를 때 데이터가 최신이 아닐 수 있으므로 fetchSubmissions를 호출합니다.
            if (btn.dataset.target === "submissions") fetchSubmissions(); 
        });
    });

    // "지역 기타" 입력 제어 (원본 유지)
    const regionRadios = document.querySelectorAll('input[name="region"]');
    const regionOtherInput = document.querySelector('input[name="regionOther"]');
    regionRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === "기타") {
                regionOtherInput.style.display = 'block';
                regionOtherInput.required = true;
            } else {
                regionOtherInput.style.display = 'none';
                regionOtherInput.required = false;
            }
        });
    });

    // FORM SUBMIT
    const form = document.getElementById("petSurveyForm");
    const msg = document.getElementById("msg");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        msg.textContent = "✅ 제출 중...";

        const data = new FormData(form);
        const payload = {};
        for (const [k, v] of data.entries()) payload[k] = v;

        // 서버 전송 로직
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

            msg.textContent = "💌 제출이 완료되었습니다! 그래프를 갱신합니다.";
            
            // ⭐️ 핵심 수정 ⭐️: 서버 전송 성공 후 전체 데이터를 다시 불러와 갱신합니다.
            // 이로써 누적 문제와 중복 표시 문제가 동시에 해결됩니다.
            await fetchSubmissions(); 

        } catch (error) {
            msg.textContent = `⚠️ 서버 응답 오류가 발생했지만, 데이터 재로딩을 시도합니다.`;
            await fetchSubmissions(); 
        }

        form.reset();
        regionOtherInput.style.display = 'none';

        // 제출 후 '다른 사람 의견 보기' 탭을 자동으로 클릭하여 그래프를 표시합니다.
        document.querySelector('.tab-btn[data-target="submissions"]').click();
    });

    // CHART (localSubmissions 배열을 사용)
    function renderCharts() {
        // 1. 기존 차트 인스턴스 파괴
        if (window.regionChart && typeof window.regionChart.destroy === 'function') {
            window.regionChart.destroy();
            window.regionChart = null;
        }
        if (window.priceChart && typeof window.priceChart.destroy === 'function') {
            window.priceChart.destroy();
            window.priceChart = null;
        }

        if (localSubmissions.length === 0) {
            return;
        }

        // 2. 데이터 집계 로직 (누적 핵심)
        const regionCount = {};
        const priceCount = {};

        localSubmissions.forEach(s => {
            let reg = s.region === "기타" ? s.regionOther : s.region;
            if (reg && reg !== "") regionCount[reg] = (regionCount[reg] || 0) + 1;
            
            let price = s.priceRange;
            if (price && price !== "") priceCount[price] = (priceCount[price] || 0) + 1;
        });
        
        // 3. REGION CHART (새로 생성)
        const ctxR = document.getElementById("regionChart").getContext("2d");
        window.regionChart = new Chart(ctxR, {
            type: 'bar',
            data: {
                labels: Object.keys(regionCount),
                datasets: [{
                    label: '응답 수',
                    data: Object.values(regionCount),
                    backgroundColor: 'rgba(255,77,79,0.7)'
                }]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, suggestedMin: 0 } }
            }
        });

        // 4. PRICE CHART (새로 생성 및 정렬)
        const ctxP = document.getElementById("priceChart").getContext("2d");
        const priceLabelsOrdered = ["50만원 미만", "50만원 ~ 100만원", "100만원 ~ 200만원", "200만원 이상"];
        const priceDataOrdered = priceLabelsOrdered.map(label => priceCount[label] || 0);

        window.priceChart = new Chart(ctxP, {
            type: 'bar',
            data: {
                labels: priceLabelsOrdered,
                datasets: [{
                    label: '응답 수',
                    data: priceDataOrdered,
                    backgroundColor: 'rgba(255,159,67,0.7)'
                }]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, suggestedMin: 0 } }
            }
        });
    }
});
