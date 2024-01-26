import React from 'react'
import {ActivityIndicator, StyleSheet, View} from 'react-native'
import {AppBskyActorDefs as ActorDefs} from '@atproto/api'
import {CenteredView} from '../util/Views'
import {LoadingScreen} from '../util/LoadingScreen'
import {List} from '../util/List'
import {ErrorMessage} from '../util/error/ErrorMessage'
import {ProfileCardWithFollowBtn} from './ProfileCard'
import {useProfileFollowsQuery} from '#/state/queries/profile-follows'
import {useResolveDidQuery} from '#/state/queries/resolve-uri'
import {logger} from '#/logger'
import {cleanError} from '#/lib/strings/errors'

export function ProfileFollows({name}: {name: string}) {
  const [isPTRing, setIsPTRing] = React.useState(false)
  const {
    data: resolvedDid,
    error: resolveError,
    isFetching: isFetchingDid,
  } = useResolveDidQuery(name)
  const {
    data,
    isFetching,
    isFetched,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError,
    error,
    refetch,
  } = useProfileFollowsQuery(resolvedDid)

  const follows = React.useMemo(() => {
    if (data?.pages) {
      return data.pages.flatMap(page => page.follows)
    }
  }, [data])

  const onRefresh = React.useCallback(async () => {
    setIsPTRing(true)
    try {
      await refetch()
    } catch (err) {
      logger.error('Failed to refresh follows', {error: err})
    }
    setIsPTRing(false)
  }, [refetch, setIsPTRing])

  const onEndReached = async () => {
    if (isFetching || !hasNextPage || isError) return
    try {
      await fetchNextPage()
    } catch (err) {
      logger.error('Failed to load more follows', {error: err})
    }
  }

  const renderItem = React.useCallback(
    ({item}: {item: ActorDefs.ProfileViewBasic}) => (
      <ProfileCardWithFollowBtn key={item.did} profile={item} />
    ),
    [],
  )

  if (isFetchingDid || !isFetched) {
    return <LoadingScreen />
  }

  // error
  // =
  if (resolveError || isError) {
    return (
      <CenteredView>
        <ErrorMessage
          message={cleanError(resolveError || error)}
          onPressTryAgain={onRefresh}
        />
      </CenteredView>
    )
  }

  // loaded
  // =
  return (
    <List
      data={follows}
      keyExtractor={item => item.did}
      refreshing={isPTRing}
      onRefresh={onRefresh}
      onEndReached={onEndReached}
      renderItem={renderItem}
      initialNumToRender={15}
      // FIXME(dan)
      // eslint-disable-next-line react/no-unstable-nested-components
      ListFooterComponent={() => (
        <View style={styles.footer}>
          {(isFetching || isFetchingNextPage) && <ActivityIndicator />}
        </View>
      )}
      // @ts-ignore our .web version only -prf
      desktopFixedHeight
    />
  )
}

const styles = StyleSheet.create({
  footer: {
    height: 200,
    paddingTop: 20,
  },
})
