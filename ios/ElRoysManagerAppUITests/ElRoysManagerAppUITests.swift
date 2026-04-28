import XCTest

final class ElRoysManagerAppUITests: XCTestCase {
  func testLaunchShowsEntryPoint() throws {
    let app = XCUIApplication()
    app.launchArguments.append("--ui-testing")
    app.launch()

    let deadline = Date().addingTimeInterval(8)
    while Date() < deadline {
      if app.buttons["Sign In"].exists ||
        app.staticTexts["Sign In"].exists ||
        app.navigationBars["Home"].exists {
        return
      }

      RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }

    XCTFail("Expected the app to launch into sign-in or an authenticated home screen.")
  }
}
