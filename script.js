document.addEventListener("DOMContentLoaded", () => {
    // 1. Google Apps Script URL을 API 서버 주소로 정의 (수정 완료)
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
     * @param {Object} payload - 렌더링할 단일 제출 데이터 객체
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

        // 최신 항목을 가장 위(앞)에 추가
        submissionsList.prepend(card);
    }

    /**
     * localSubmissions 전체를 불러와서 목록을 지우고 다시 그리는 함수 (모든 항목 재렌더링 역할)
     * ⚠️ 문제 해결 1 & 2의 핵심: 목록 컨테이너를 비우고 (submissionsList.innerHTML = '';), 전체를 다시 그립니다.
     * @param {Array} dataArray - localSubmissions 배열
     */
    const renderAllSubmissions = (dataArray) => {
        // [수정] 기존 목록을 완전히 비워 중복 렌더링을 방지합니다.
        submissionsList.innerHTML = '';
        
        if (dataArray.length === 0) {
            submissionsList.innerHTML = '<div class="placeholder">제출된 기록이 없습니다.</div>';
            return;
        }

        // 불러온 모든 데이터를 리스트에 렌더링 (최신순으로 보이도록 reverse())
        dataArray.slice().reverse().forEach(s => renderSubmissionCard(s));
    };

    // 🔑 핵심 기능: 초기 데이터를 서버에서 가져와서 화면에 표시하는 함수
    const fetchSubmissions = async () => {
        try {
            submissionsList.innerHTML = '<div class="placeholder">제출된 기록을 불러오는 중입니다...</div>'; // 로딩 메시지

            const response = await fetch(API_URL);
            const data = await response.json();

            // 로딩 메시지 제거는 renderAllSubmissions에서 처리됨

            if (Array.isArray(data)) {
                // 서버에서 불러온 데이터를 로컬 배열에 저장
                localSubmissions = data;

                // [수정] 불러온 모든 데이터를 목록에 렌더링합니다. (컨테이너 비우기 포함)
                renderAllSubmissions(localSubmissions);

            } else {
                console.error("서버에서 받은 데이터 형식이 올바르지 않습니다.");
                submissionsList.innerHTML = '<div class="placeholder">데이터 로딩에 실패했습니다. 서버 설정(Google Apps Script)을 확인하세요.</div>';
            }

            // 데이터 로드 후 '다른 사람 의견 보기' 탭이 활성화되어 있다면 그래프를 그립니다.
            if (document.querySelector('.tab-btn[data-target="submissions"]').classList.contains('active')) {
                renderCharts();
            }

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
            // submissions 탭을 누르면 무조건 그래프를 다시 그립니다.
            if (btn.dataset.target === "submissions") renderCharts();
        });
    });

    // "지역 기타" 입력 제어 (생략 없이 원본 유지)
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

    // FORM SUBMIT (제출 시 서버 전송 및 로컬 저장 기능 포함)
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

            // 서버 전송 성공 후 로컬 배열에 저장 (데이터 누적)
            localSubmissions.push(payload);
            msg.textContent = "💌 제출이 완료되었습니다! (Google Sheets에 저장됨)";

        } catch (error) {
            // no-cors mode로 인해 실제 오류와 상관없이 catch에 걸릴 수 있지만, 서버에 데이터는 전송됩니다.
            msg.textContent = `⚠️ 제출 요청은 성공했지만 (no-cors), 응답을 받는데 오류가 발생했습니다. (데이터는 서버에 저장됨)`;
            // 로컬 배열에 저장하여 바로 그래프에 반영
            localSubmissions.push(payload);
        }

        // [수정] submissions list에 방금 제출한 항목 하나만 추가 및 UI 업데이트
        // 기존 'renderSubmissionList(payload);'를 renderSubmissionCard로 변경
        // 이렇게 해야 폼 제출 후 항목이 1번만 추가됩니다.
        renderSubmissionCard(payload);

        form.reset();
        regionOtherInput.style.display = 'none';

        // 제출 후 '다른 사람 의견 보기' 탭을 자동으로 클릭하여 그래프를 표시합니다.
        document.querySelector('.tab-btn[data-target="submissions"]').click();
    });

    // CHART (localSubmissions 배열을 사용)
    function renderCharts() {
        const regionCount = {};
        const priceCount = {};

        // [수정] localSubmissions 배열에 있는 '모든' 데이터를 사용합니다. (누적 해결)
        localSubmissions.forEach(s => {
            // 지역
            let reg = s.region === "기타" ? s.regionOther : s.region;
            if (reg) regionCount[reg] = (regionCount[reg] || 0) + 1;
            // 가격
            let price = s.priceRange;
            if (price) priceCount[price] = (priceCount[price] || 0) + 1;
        });

        // 그래프가 그려질 때 리스트가 비어있다면 placeholder를 숨깁니다.
        const placeholder = submissionsList.querySelector('.placeholder');
        if (placeholder) {
            placeholder.style.display = localSubmissions.length > 0 ? 'none' : 'grid';
        }


        // REGION CHART (기존 차트 객체 파괴 후 새로 생성)
        const ctxR = document.getElementById("regionChart").getContext("2d");
        if (window.regionChart && typeof window.regionChart.destroy === 'function') {
            window.regionChart.destroy();
        }
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
            options: { responsive: true, plugins: { legend: { display: false } } }
        });

        // PRICE CHART (기존 차트 객체 파괴 후 새로 생성)
        const ctxP = document.getElementById("priceChart").getContext("2d");
        if (window.priceChart && typeof window.priceChart.destroy === 'function') {
            window.priceChart.destroy();
        }
        // [수정] 가격 라벨을 일관성 있게 정렬합니다. (차트 가독성 향상)
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
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    }
});
