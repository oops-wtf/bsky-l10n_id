import React from 'react'
import {flushSync} from 'react-dom'
import {View} from 'react-native'
import {s} from 'lib/styles'

export interface RenderTabBarFnProps {
  selectedPage: number
  onSelect?: (index: number) => void
  tabBarAnchor?: JSX.Element
}
export type RenderTabBarFn = (props: RenderTabBarFnProps) => JSX.Element

interface Props {
  tabBarPosition?: 'top' | 'bottom'
  initialPage?: number
  renderTabBar: RenderTabBarFn
  onPageSelected?: (index: number) => void
  onPageSelecting?: (index: number) => void
}
export const Pager = React.forwardRef(function PagerImpl(
  {
    children,
    tabBarPosition = 'top',
    initialPage = 0,
    renderTabBar,
    onPageSelected,
    onPageSelecting,
  }: React.PropsWithChildren<Props>,
  ref,
) {
  const [selectedPage, setSelectedPage] = React.useState(initialPage)
  const scrollYs = React.useRef<Array<number | null>>([])
  const anchorRef = React.useRef(null)

  React.useImperativeHandle(ref, () => ({
    setPage: (index: number) => setSelectedPage(index),
  }))

  const onTabBarSelect = React.useCallback(
    (index: number) => {
      const scrollY = window.scrollY
      // We want to determine if the tabbar is already "sticking" at the top (in which
      // case we should preserve and restore scroll), or if it is somewhere below in the
      // viewport (in which case a scroll jump would be jarring). We determine this by
      // measuring where the "anchor" element is (which we place just above the tabbar).
      let anchorTop = anchorRef.current
        ? (anchorRef.current as Element).getBoundingClientRect().top
        : -scrollY // If there's no anchor, treat the top of the page as one.
      const isSticking = anchorTop <= 5 // This would be 0 if browser scrollTo() was reliable.

      if (isSticking) {
        scrollYs.current[selectedPage] = window.scrollY
      } else {
        scrollYs.current[selectedPage] = null
      }
      flushSync(() => {
        setSelectedPage(index)
        onPageSelected?.(index)
        onPageSelecting?.(index)
      })
      if (isSticking) {
        const restoredScrollY = scrollYs.current[index]
        if (restoredScrollY != null) {
          window.scrollTo(0, restoredScrollY)
        } else {
          window.scrollTo(0, scrollY + anchorTop)
        }
      }
    },
    [selectedPage, setSelectedPage, onPageSelected, onPageSelecting],
  )

  return (
    <View style={s.hContentRegion}>
      {tabBarPosition === 'top' &&
        renderTabBar({
          selectedPage,
          tabBarAnchor: <View ref={anchorRef} />,
          onSelect: onTabBarSelect,
        })}
      {React.Children.map(children, (child, i) => (
        <View style={selectedPage === i ? s.flex1 : s.hidden} key={`page-${i}`}>
          {child}
        </View>
      ))}
      {tabBarPosition === 'bottom' &&
        renderTabBar({
          selectedPage,
          onSelect: onTabBarSelect,
        })}
    </View>
  )
})
