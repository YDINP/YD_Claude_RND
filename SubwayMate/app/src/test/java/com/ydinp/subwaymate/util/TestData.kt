package com.ydinp.subwaymate.util

import com.ydinp.subwaymate.domain.model.AlertSetting
import com.ydinp.subwaymate.domain.model.Direction
import com.ydinp.subwaymate.domain.model.Line
import com.ydinp.subwaymate.domain.model.LineType
import com.ydinp.subwaymate.domain.model.RideSession
import com.ydinp.subwaymate.domain.model.RideStatus
import com.ydinp.subwaymate.domain.model.Station
import com.ydinp.subwaymate.domain.model.TrainLocation
import com.ydinp.subwaymate.domain.model.TrainStatus
import com.ydinp.subwaymate.domain.repository.FavoriteRoute
import com.ydinp.subwaymate.domain.repository.FavoriteStation
import java.time.LocalDateTime

/**
 * 테스트용 샘플 데이터를 제공하는 object
 *
 * 테스트에서 일관된 데이터를 사용할 수 있도록 미리 정의된 테스트 데이터를 제공합니다.
 */
object TestData {

    // ============== 노선 데이터 ==============

    val line1 = Line(
        id = "1001",
        name = "1호선",
        color = "#0052A4",
        type = LineType.STANDARD
    )

    val line2 = Line(
        id = "1002",
        name = "2호선",
        color = "#00A84D",
        type = LineType.CIRCULAR
    )

    val line3 = Line(
        id = "1003",
        name = "3호선",
        color = "#EF7C1C",
        type = LineType.STANDARD
    )

    val line4 = Line(
        id = "1004",
        name = "4호선",
        color = "#00A5DE",
        type = LineType.STANDARD
    )

    val allLines = listOf(line1, line2, line3, line4)

    // ============== 역 데이터 (1호선) ==============

    val stationSeoul = Station(
        id = "1001000001",
        name = "서울역",
        lineId = "1001",
        latitude = 37.5546,
        longitude = 126.9706,
        transferLines = listOf("1004", "경의중앙선")
    )

    val stationSiCheong = Station(
        id = "1001000002",
        name = "시청",
        lineId = "1001",
        latitude = 37.5637,
        longitude = 126.9770,
        transferLines = listOf("1002")
    )

    val stationJongGak = Station(
        id = "1001000003",
        name = "종각",
        lineId = "1001",
        latitude = 37.5701,
        longitude = 126.9827,
        transferLines = emptyList()
    )

    val stationJongNo3Ga = Station(
        id = "1001000004",
        name = "종로3가",
        lineId = "1001",
        latitude = 37.5713,
        longitude = 126.9920,
        transferLines = listOf("1003", "1005")
    )

    val stationJongNo5Ga = Station(
        id = "1001000005",
        name = "종로5가",
        lineId = "1001",
        latitude = 37.5709,
        longitude = 127.0019,
        transferLines = emptyList()
    )

    val stationDongDaeMun = Station(
        id = "1001000006",
        name = "동대문",
        lineId = "1001",
        latitude = 37.5712,
        longitude = 127.0096,
        transferLines = listOf("1004")
    )

    val line1Stations = listOf(
        stationSeoul,
        stationSiCheong,
        stationJongGak,
        stationJongNo3Ga,
        stationJongNo5Ga,
        stationDongDaeMun
    )

    // ============== 역 데이터 (2호선) ==============

    val stationGangNam = Station(
        id = "1002000001",
        name = "강남",
        lineId = "1002",
        latitude = 37.4979,
        longitude = 127.0276,
        transferLines = listOf("신분당선")
    )

    val stationYeokSam = Station(
        id = "1002000002",
        name = "역삼",
        lineId = "1002",
        latitude = 37.5006,
        longitude = 127.0366,
        transferLines = emptyList()
    )

    val stationSeonReung = Station(
        id = "1002000003",
        name = "선릉",
        lineId = "1002",
        latitude = 37.5046,
        longitude = 127.0490,
        transferLines = listOf("분당선")
    )

    val stationSamSeong = Station(
        id = "1002000004",
        name = "삼성",
        lineId = "1002",
        latitude = 37.5088,
        longitude = 127.0630,
        transferLines = emptyList()
    )

    val line2Stations = listOf(
        stationGangNam,
        stationYeokSam,
        stationSeonReung,
        stationSamSeong
    )

    val allStations = line1Stations + line2Stations

    // ============== 열차 위치 데이터 ==============

    val trainLocation1 = TrainLocation(
        trainNo = "1234",
        lineId = "1001",
        currentStationId = "1001000002",
        nextStationId = "1001000003",
        direction = Direction.DOWN,
        estimatedArrivalTime = LocalDateTime.now().plusMinutes(2),
        trainStatus = TrainStatus.IN_TRANSIT,
        destinationStationId = "1001000006",
        updatedAt = LocalDateTime.now()
    )

    val trainLocation2 = TrainLocation(
        trainNo = "1235",
        lineId = "1001",
        currentStationId = "1001000001",
        nextStationId = "1001000002",
        direction = Direction.DOWN,
        estimatedArrivalTime = LocalDateTime.now().plusMinutes(5),
        trainStatus = TrainStatus.DEPARTING,
        destinationStationId = "1001000006",
        updatedAt = LocalDateTime.now()
    )

    val trainLocation3 = TrainLocation(
        trainNo = "2001",
        lineId = "1002",
        currentStationId = "1002000001",
        nextStationId = "1002000002",
        direction = Direction.INNER,
        estimatedArrivalTime = LocalDateTime.now().plusMinutes(3),
        trainStatus = TrainStatus.APPROACHING,
        destinationStationId = "1002000004",
        updatedAt = LocalDateTime.now()
    )

    val allTrainLocations = listOf(trainLocation1, trainLocation2, trainLocation3)

    // ============== 알림 설정 데이터 ==============

    val defaultAlertSetting = AlertSetting.default()

    val customAlertSetting = AlertSetting(
        stationsBefore = 3,
        minutesBefore = 5,
        soundEnabled = true,
        vibrationEnabled = true,
        repeatCount = 2,
        repeatIntervalSeconds = 30
    )

    val silentAlertSetting = AlertSetting.silentWithVibration()

    // ============== 탑승 세션 데이터 ==============

    val rideSession1 = RideSession(
        id = "session-001",
        departureStation = stationSeoul,
        arrivalStation = stationDongDaeMun,
        line = line1,
        direction = Direction.DOWN,
        startTime = LocalDateTime.now().minusMinutes(10),
        currentStation = stationJongGak,
        status = RideStatus.IN_TRANSIT,
        alertSetting = defaultAlertSetting,
        remainingStations = 3,
        estimatedArrivalTime = LocalDateTime.now().plusMinutes(6),
        trackedTrainNo = "1234",
        alertSent = false
    )

    val rideSessionBoarding = RideSession(
        id = "session-002",
        departureStation = stationGangNam,
        arrivalStation = stationSamSeong,
        line = line2,
        direction = Direction.INNER,
        startTime = LocalDateTime.now(),
        currentStation = null,
        status = RideStatus.BOARDING,
        alertSetting = customAlertSetting,
        remainingStations = 3,
        estimatedArrivalTime = null,
        trackedTrainNo = null,
        alertSent = false
    )

    val rideSessionApproaching = RideSession(
        id = "session-003",
        departureStation = stationSeoul,
        arrivalStation = stationJongNo3Ga,
        line = line1,
        direction = Direction.DOWN,
        startTime = LocalDateTime.now().minusMinutes(5),
        currentStation = stationJongGak,
        status = RideStatus.APPROACHING,
        alertSetting = defaultAlertSetting,
        remainingStations = 1,
        estimatedArrivalTime = LocalDateTime.now().plusMinutes(2),
        trackedTrainNo = "1234",
        alertSent = false
    )

    val rideSessionArrived = RideSession(
        id = "session-004",
        departureStation = stationSeoul,
        arrivalStation = stationJongGak,
        line = line1,
        direction = Direction.DOWN,
        startTime = LocalDateTime.now().minusMinutes(8),
        currentStation = stationJongGak,
        status = RideStatus.ARRIVED,
        alertSetting = defaultAlertSetting,
        remainingStations = 0,
        estimatedArrivalTime = null,
        trackedTrainNo = "1234",
        alertSent = true
    )

    // ============== 즐겨찾기 데이터 ==============

    val favoriteStation1 = FavoriteStation(
        station = stationSeoul,
        nickname = "집 근처",
        order = 0,
        createdAt = System.currentTimeMillis() - 86400000 // 1일 전
    )

    val favoriteStation2 = FavoriteStation(
        station = stationGangNam,
        nickname = "회사",
        order = 1,
        createdAt = System.currentTimeMillis() - 43200000 // 12시간 전
    )

    val favoriteStation3 = FavoriteStation(
        station = stationSamSeong,
        nickname = null,
        order = 2,
        createdAt = System.currentTimeMillis()
    )

    val allFavoriteStations = listOf(favoriteStation1, favoriteStation2, favoriteStation3)

    val favoriteRoute1 = FavoriteRoute(
        id = "route-001",
        departureStation = stationSeoul,
        arrivalStation = stationDongDaeMun,
        lineId = "1001",
        direction = Direction.DOWN,
        alertSetting = defaultAlertSetting,
        nickname = "출퇴근 경로",
        usageCount = 15,
        lastUsedAt = System.currentTimeMillis() - 3600000, // 1시간 전
        createdAt = System.currentTimeMillis() - 604800000 // 1주일 전
    )

    val favoriteRoute2 = FavoriteRoute(
        id = "route-002",
        departureStation = stationGangNam,
        arrivalStation = stationSamSeong,
        lineId = "1002",
        direction = Direction.INNER,
        alertSetting = customAlertSetting,
        nickname = null,
        usageCount = 5,
        lastUsedAt = System.currentTimeMillis() - 7200000, // 2시간 전
        createdAt = System.currentTimeMillis() - 259200000 // 3일 전
    )

    val allFavoriteRoutes = listOf(favoriteRoute1, favoriteRoute2)

    // ============== 헬퍼 함수 ==============

    /**
     * 테스트용 Station 생성 헬퍼
     */
    fun createStation(
        id: String = "test-station-${System.currentTimeMillis()}",
        name: String = "테스트역",
        lineId: String = "1001",
        latitude: Double = 37.5,
        longitude: Double = 127.0,
        transferLines: List<String> = emptyList()
    ) = Station(
        id = id,
        name = name,
        lineId = lineId,
        latitude = latitude,
        longitude = longitude,
        transferLines = transferLines
    )

    /**
     * 테스트용 Line 생성 헬퍼
     */
    fun createLine(
        id: String = "test-line-${System.currentTimeMillis()}",
        name: String = "테스트호선",
        color: String = "#000000",
        type: LineType = LineType.STANDARD
    ) = Line(
        id = id,
        name = name,
        color = color,
        type = type
    )

    /**
     * 테스트용 TrainLocation 생성 헬퍼
     */
    fun createTrainLocation(
        trainNo: String = "test-train-${System.currentTimeMillis()}",
        lineId: String = "1001",
        currentStationId: String = "1001000001",
        nextStationId: String = "1001000002",
        direction: Direction = Direction.DOWN,
        trainStatus: TrainStatus = TrainStatus.IN_TRANSIT
    ) = TrainLocation(
        trainNo = trainNo,
        lineId = lineId,
        currentStationId = currentStationId,
        nextStationId = nextStationId,
        direction = direction,
        estimatedArrivalTime = LocalDateTime.now().plusMinutes(3),
        trainStatus = trainStatus,
        destinationStationId = "1001000006",
        updatedAt = LocalDateTime.now()
    )

    /**
     * 테스트용 RideSession 생성 헬퍼
     */
    fun createRideSession(
        id: String = "test-session-${System.currentTimeMillis()}",
        departureStation: Station = stationSeoul,
        arrivalStation: Station = stationDongDaeMun,
        line: Line = line1,
        direction: Direction = Direction.DOWN,
        status: RideStatus = RideStatus.BOARDING,
        remainingStations: Int = 5,
        trackedTrainNo: String? = null
    ) = RideSession(
        id = id,
        departureStation = departureStation,
        arrivalStation = arrivalStation,
        line = line,
        direction = direction,
        startTime = LocalDateTime.now(),
        currentStation = null,
        status = status,
        alertSetting = AlertSetting.default(),
        remainingStations = remainingStations,
        estimatedArrivalTime = null,
        trackedTrainNo = trackedTrainNo,
        alertSent = false
    )
}
