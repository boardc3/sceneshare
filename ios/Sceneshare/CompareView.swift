import SwiftUI

/// Before and after of the same photo, with a divider you drag.
struct CompareView: View {
    let before: URL
    let after: URL?
    let aspect: CGFloat
    @State private var position: CGFloat = 0.5

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                picture(after ?? before)
                if after != nil {
                    picture(before)
                        .mask(alignment: .leading) {
                            Rectangle().frame(width: max(0, w * position))
                        }
                    Rectangle()
                        .fill(.white)
                        .frame(width: 2)
                        .offset(x: w * position - 1)
                    Circle()
                        .fill(.white)
                        .frame(width: 40, height: 40)
                        .shadow(radius: 4)
                        .overlay(Image(systemName: "arrow.left.and.right").font(.footnote.bold()).foregroundStyle(Theme.dusk))
                        .offset(x: w * position - 20)
                    tag("Before", alignment: .topLeading)
                    tag("After", alignment: .topTrailing, glow: true)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0).onChanged { g in
                    position = min(1, max(0, g.location.x / max(1, w)))
                }
            )
        }
        .aspectRatio(aspect, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func picture(_ url: URL) -> some View {
        AsyncImage(url: url) { img in
            img.resizable().scaledToFit()
        } placeholder: {
            ZStack { Theme.dusk.opacity(0.08); ProgressView() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func tag(_ text: String, alignment: Alignment, glow: Bool = false) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(glow ? Theme.glow : Theme.dusk.opacity(0.75))
            .foregroundStyle(glow ? Theme.dusk : .white)
            .clipShape(Capsule())
            .padding(10)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .allowsHitTesting(false)
    }
}
