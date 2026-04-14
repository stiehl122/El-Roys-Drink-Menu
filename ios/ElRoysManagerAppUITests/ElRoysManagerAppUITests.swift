import XCTest

final class ElRoysManagerAppUITests: XCTestCase {
  func testLaunchShowsStaffManager() throws {
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.staticTexts["Staff Manager"].waitForExistence(timeout: 5))
  }
}
