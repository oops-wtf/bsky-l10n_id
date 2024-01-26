import React from 'react'
import {View} from 'react-native'
import {useLingui} from '@lingui/react'
import {msg, Trans} from '@lingui/macro'

import {atoms as a, tokens, useTheme} from '#/alf'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronRight} from '#/components/icons/Chevron'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Toggle from '#/components/forms/Toggle'
import {Text} from '#/components/Typography'
import {Loader} from '#/components/Loader'
import {ListSparkle_Stroke2_Corner0_Rounded as ListSparkle} from '#/components/icons/ListSparkle'
import {useAnalytics} from '#/lib/analytics/analytics'

import {Context} from '#/screens/Onboarding/state'
import {
  Title,
  Description,
  OnboardingControls,
} from '#/screens/Onboarding/Layout'
import {FeedCard} from '#/screens/Onboarding/StepAlgoFeeds/FeedCard'
import {IconCircle} from '#/screens/Onboarding/IconCircle'

export type FeedConfig = {
  default: boolean
  uri: string
  gradient?: typeof tokens.gradients.midnight | typeof tokens.gradients.nordic
}

const PRIMARY_FEEDS: FeedConfig[] = [
  {
    default: true,
    uri: 'at://did:plc:wqowuobffl66jv3kpsvo7ak4/app.bsky.feed.generator/the-algorithm',
    gradient: tokens.gradients.midnight,
  },
  {
    default: false,
    uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot',
    gradient: tokens.gradients.midnight,
  },
]

const SECONDARY_FEEDS: FeedConfig[] = [
  {
    default: false,
    uri: 'at://did:plc:vpkhqolt662uhesyj6nxm7ys/app.bsky.feed.generator/infreq',
  },
  {
    default: false,
    uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/with-friends',
  },
  {
    default: false,
    uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/best-of-follows',
  },
  {
    default: false,
    uri: 'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/catch-up',
  },
  {
    default: false,
    uri: 'at://did:plc:q6gjnaw2blty4crticxkmujt/app.bsky.feed.generator/at-bangers',
  },
]

export function StepAlgoFeeds() {
  const {_} = useLingui()
  const {track} = useAnalytics()
  const t = useTheme()
  const {state, dispatch} = React.useContext(Context)
  const [primaryFeedUris, setPrimaryFeedUris] = React.useState<string[]>(
    PRIMARY_FEEDS.map(f => (f.default ? f.uri : '')).filter(Boolean),
  )
  const [secondaryFeedUris, setSeconaryFeedUris] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)

  const saveFeeds = React.useCallback(async () => {
    setSaving(true)

    const uris = primaryFeedUris.concat(secondaryFeedUris)
    dispatch({type: 'setAlgoFeedsStepResults', feedUris: uris})

    setSaving(false)
    dispatch({type: 'next'})
    track('OnboardingV2:StepAlgoFeeds:End', {
      selectedPrimaryFeeds: primaryFeedUris,
      selectedPrimaryFeedsLength: primaryFeedUris.length,
      selectedSecondaryFeeds: secondaryFeedUris,
      selectedSecondaryFeedsLength: secondaryFeedUris.length,
    })
  }, [primaryFeedUris, secondaryFeedUris, dispatch, track])

  React.useEffect(() => {
    track('OnboardingV2:StepAlgoFeeds:Start')
  }, [track])

  return (
    <View style={[a.align_start]}>
      <IconCircle icon={ListSparkle} style={[a.mb_2xl]} />

      <Title>
        <Trans>Choose your algorithmic feeds</Trans>
      </Title>
      <Description>
        <Trans>
          Feeds are created by users and can give you entirely new experiences.
        </Trans>
      </Description>

      <View style={[a.w_full, a.pb_2xl]}>
        <Toggle.Group
          values={primaryFeedUris}
          onChange={setPrimaryFeedUris}
          label={_(msg`Select your primary algorithmic feeds`)}>
          <Text
            style={[a.text_md, a.pt_4xl, a.pb_md, t.atoms.text_contrast_700]}>
            <Trans>We recommend "For You" by Skygaze:</Trans>
          </Text>
          <FeedCard config={PRIMARY_FEEDS[0]} />
          <Text
            style={[a.text_md, a.pt_4xl, a.pb_lg, t.atoms.text_contrast_700]}>
            <Trans>Or you can try our "Discover" algorithm:</Trans>
          </Text>
          <FeedCard config={PRIMARY_FEEDS[1]} />
        </Toggle.Group>

        <Toggle.Group
          values={secondaryFeedUris}
          onChange={setSeconaryFeedUris}
          label={_(msg`Select your secondary algorithmic feeds`)}>
          <Text
            style={[a.text_md, a.pt_4xl, a.pb_lg, t.atoms.text_contrast_700]}>
            <Trans>There are many feeds to try:</Trans>
          </Text>
          <View style={[a.gap_md]}>
            {SECONDARY_FEEDS.map(config => (
              <FeedCard key={config.uri} config={config} />
            ))}
          </View>
        </Toggle.Group>
      </View>

      <OnboardingControls.Portal>
        <Button
          disabled={saving}
          key={state.activeStep} // remove focus state on nav
          variant="gradient"
          color="gradient_sky"
          size="large"
          label={_(msg`Continue to the next step`)}
          onPress={saveFeeds}>
          <ButtonText>
            <Trans>Continue</Trans>
          </ButtonText>
          <ButtonIcon icon={saving ? Loader : ChevronRight} position="right" />
        </Button>
      </OnboardingControls.Portal>
    </View>
  )
}
